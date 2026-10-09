
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

const DAILY_CLOSE_CRON_SECRET_SHA256 =
  "eb9a0fcfbf3e942ea3530ced14b5976aff59c6a64f426d10577a875ac804cceb";

const AGENCY_TIME_ZONE = "America/Argentina/Buenos_Aires";

async function matchesDailyCloseSecret(candidate: string): Promise<boolean> {
  if (!candidate) return false;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(candidate),
  );

  const value = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

  return value === DAILY_CLOSE_CRON_SECRET_SHA256;
}

function agencyDateInfo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AGENCY_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value ?? "00";

  return {
    isoDay:
      part("year") + "-" + part("month") + "-" + part("day"),
    displayDay:
      part("day") + "/" + part("month") + "/" + part("year"),
    timestamp:
      part("day") + "/" + part("month") + "/" + part("year") +
      " " + part("hour") + ":" + part("minute") + ":" +
      part("second") + " (Buenos Aires, Argentina)",
  };
}

function normalizeBackupText(rawText: string): string {
  return rawText
    .replace(/\\\\\\\\\\\\\\\\n/g, "\n")
    .replace(/\\\\n/g, "\n")
    .replace(/\r\n?/g, "\n");
}

function formatDailyBackupItem(rawText: string, createdAt: string): string {
  let normalized = normalizeBackupText(rawText);

  normalized = normalized.replace(
    /Fecha del juego: (\d{4})-(\d{2})-(\d{2})/g,
    (_match, year, month, day) =>
      "Fecha del juego: " + day + "/" + month + "/" + year,
  );

  const date = new Date(createdAt);

  if (!Number.isNaN(date.getTime())) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: AGENCY_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);

    const part = (name: string) =>
      parts.find((item) => item.type === name)?.value ?? "00";

    const stamp =
      part("day") + "/" + part("month") + "/" + part("year") +
      " " + part("hour") + ":" + part("minute") + ":" +
      part("second") + " (Buenos Aires, Argentina)";

    normalized = normalized.replace(
      /Registrada: [^\n\r]+/,
      "Registrada: " + stamp,
    );
  }

  return normalized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBackupHtml(text: string): string {
  return (
    '<!doctype html><html lang="es"><head>' +
    '<meta charset="utf-8"></head><body>' +
    '<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;' +
    'overflow-wrap:anywhere;">' +
    escapeHtml(text) +
    "</pre></body></html>"
  );
}

async function sendDailyCloseBackups(
  admin: any,
  resendApiKey: string | undefined,
  resendFromEmail: string | undefined,
  organizationIdFilter?: string,
  onlyRenditionId?: string,
) {
  if (!resendApiKey) {
    return reply({
      error: "email_provider_not_configured",
      message: "Configure RESEND_API_KEY en los secretos de la función de Supabase.",
    }, 503);
  }

  // Sin dominio verificado, Resend solo permite probar con el correo del titular de la cuenta.
  const sender = String(resendFromEmail ?? "").trim() ||
    "Agencias Corrientes <onboarding@resend.dev>";

  const now = new Date();
  const dateInfo = agencyDateInfo(now);

  let outboxQuery = admin
    .from("agency_rendition_backup_outbox")
    .select("*")
    .order("created_at", { ascending: false });
  if (organizationIdFilter) {
    outboxQuery = outboxQuery.eq("organization_id", organizationIdFilter);
  }
  const { data: allRows, error: lookupError } = await outboxQuery.limit(10000);

  if (lookupError) {
    return reply({ error: "daily_backup_lookup_failed" }, 500);
  }

  if ((allRows ?? []).length >= 10000) {
    return reply({
      error: "daily_backup_history_limit_reached",
      message: "Se alcanzó el límite de lectura; no se envió una copia parcial.",
    }, 500);
  }

  // Mantiene solo la revisión más reciente de cada rendición.
  const latestByRendition = new Map<string, any>();

  for (const row of allRows ?? []) {
    const key = String(row.rendition_id);
    const previous = latestByRendition.get(key);

    if (
      !previous ||
      Number(row.revision_no ?? 1) > Number(previous.revision_no ?? 1)
    ) {
      latestByRendition.set(key, row);
    }
  }

  const retryBefore = now.getTime() - 20 * 60 * 1000;

  const pendingRows = Array.from(latestByRendition.values())
    .filter((row) => {
      if (onlyRenditionId && String(row.rendition_id) !== onlyRenditionId) return false;
      if (row.status === "pending" || row.status === "failed") {
        return true;
      }

      return row.status === "sending" &&
        Date.parse(String(row.last_attempt_at ?? row.created_at ?? "")) <
          retryBefore;
    })
    .sort(
      (a, b) =>
        Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)),
    );

  if (!pendingRows.length) {
    return reply({
      status: "nothing_to_send",
      date: dateInfo.displayDay,
      renditions: 0,
    });
  }

  const renditionIds = Array.from(
    new Set(pendingRows.map((row) => String(row.rendition_id))),
  );

  const { data: renditionMetadata, error: renditionMetadataError } =
    await admin
      .from("agency_renditions")
      .select("id,created_at,rendition_date")
      .in("id", renditionIds);

  if (renditionMetadataError) {
    return reply({
      error: "daily_backup_rendition_metadata_failed",
    }, 500);
  }

  const renditionMetadataById = new Map(
    (renditionMetadata ?? []).map((row: any) => [String(row.id), row]),
  );

  // Cada agencia conserva su propio lote y destinatario.
  const batches = new Map<string, any[]>();

  for (const row of pendingRows) {
    const key = String(row.organization_id);
    batches.set(key, [...(batches.get(key) ?? []), row]);
  }

  const results: {
    organization_id: string;
    renditions: number;
    status: string;
    error?: string;
  }[] = [];

  for (const [organizationId, rows] of batches) {
    const claimed: any[] = [];

    for (const row of rows) {
      const { data, error } = await admin
        .from("agency_rendition_backup_outbox")
        .update({
          status: "sending",
          attempt_count: Number(row.attempt_count ?? 0) + 1,
          last_attempt_at: now.toISOString(),
          last_error: null,
        })
        .eq("id", row.id)
        .eq("status", row.status)
        .select("*")
        .maybeSingle();

      if (!error && data) claimed.push(data);
    }

    if (!claimed.length) continue;

    claimed.sort(
      (a, b) =>
        Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)),
    );

    const recipient = String(
      claimed[claimed.length - 1].recipient_email ?? "",
    ).trim();

    if (!recipient) {
      await admin
        .from("agency_rendition_backup_outbox")
        .update({
          status: "failed",
          last_error:
            "No hay correo de respaldo configurado para el cierre diario.",
        })
        .in("id", claimed.map((row) => row.id));

      results.push({
        organization_id: organizationId,
        renditions: claimed.length,
        status: "failed_no_recipient",
      });

      continue;
    }

    const sections = claimed.map(
      (row, index) =>
        "========== RENDICIÓN " + (index + 1) + " DE " +
        claimed.length + " ==========\n" +
        formatDailyBackupItem(
          String(row.text_body ?? "(sin detalle de respaldo)"),
          String(
            renditionMetadataById.get(String(row.rendition_id))?.created_at ??
              row.created_at ??
              now.toISOString(),
          ),
        ),
    );

    let textBody =
      "BACKUP DIARIO DE RENDICIONES - AGENCIAS CORRIENTES\n" +
      "Fecha del cierre: " + dateInfo.displayDay + "\n" +
      "Generado: " + dateInfo.timestamp + "\n" +
      "Cantidad de rendiciones incluidas: " + claimed.length + "\n\n" +
      sections.join("\n\n");

    const attachments: { filename: string; content: string }[] = [];
    let totalAttachmentBytes = 0;
    let omittedPhotos = 0;

    const maxAttachmentBytes = 15 * 1024 * 1024;

    for (let index = 0; index < claimed.length; index++) {
      const row = claimed[index];

      if (!row.ticket_photo_path) continue;

      const { data: photoData, error: photoError } = await admin.storage
        .from("agency-rendition-tickets")
        .download(row.ticket_photo_path);

      if (photoError || !photoData) {
        omittedPhotos++;
        continue;
      }

      try {
        const bytes = new Uint8Array(await photoData.arrayBuffer());

        if (totalAttachmentBytes + bytes.length > maxAttachmentBytes) {
          omittedPhotos++;
          continue;
        }

        let binary = "";

        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
          );
        }

        const path = String(row.ticket_photo_path);

        const extension = path.endsWith(".png")
          ? "png"
          : path.endsWith(".webp")
          ? "webp"
          : "jpg";

        attachments.push({
          filename: "ticket-rendicion-" + (index + 1) + "." + extension,
          content: btoa(binary),
        });

        totalAttachmentBytes += bytes.length;
      } catch {
        omittedPhotos++;
      }
    }

    if (omittedPhotos) {
      textBody +=
        "\n\nNOTA: " + omittedPhotos +
        " foto(s) no se adjuntaron por no estar disponibles o superar el " +
        "límite de adjuntos. Los datos de las rendiciones están incluidos.";
    }

    // Envío transaccional inmediato mediante Resend, con clave de idempotencia para evitar duplicados.
    const idempotencySource = [
      "agency-rendition-backup",
      organizationId,
      dateInfo.isoDay,
      claimed.map((row) => String(row.id)).sort().join(","),
    ].join("|");
    const idempotencyDigest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(idempotencySource),
    );
    const idempotencyKey = "agency-backup-" + Array.from(
      new Uint8Array(idempotencyDigest),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("").slice(0, 48);

    let providerResponse: Response;
    let providerText = "";
    try {
      providerResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + resendApiKey,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: sender,
          to: [recipient],
          subject: "Backup diario de rendiciones - " + dateInfo.displayDay,
          text: textBody,
          html: formatBackupHtml(textBody),
          ...(attachments.length ? { attachments } : {}),
        }),
        signal: AbortSignal.timeout(30000),
      });
      providerText = await providerResponse.text();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "No se pudo conectar con Resend.";
      await admin
        .from("agency_rendition_backup_outbox")
        .update({ status: "failed", last_error: String(reason).slice(0, 1000) })
        .in("id", claimed.map((row) => row.id));
      results.push({
        organization_id: organizationId,
        renditions: claimed.length,
        status: "failed",
        error: String(reason).slice(0, 500),
      });
      continue;
    }

    let providerResult: Record<string, unknown> | null = null;
    try {
      providerResult = JSON.parse(providerText);
    } catch {
      providerResult = null;
    }

    const providerMessageId = typeof providerResult?.id === "string" ? providerResult.id : "";
    if (!providerResponse.ok || !providerMessageId) {
      const reason =
        typeof providerResult?.message === "string"
          ? providerResult.message
          : typeof providerResult?.error === "string"
          ? providerResult.error
          : providerText.slice(0, 1000) || "Resend rechazó el envío.";

      await admin
        .from("agency_rendition_backup_outbox")
        .update({ status: "failed", last_error: String(reason).slice(0, 1000) })
        .in("id", claimed.map((row) => row.id));

      results.push({
        organization_id: organizationId,
        renditions: claimed.length,
        status: "failed",
        error: String(reason).slice(0, 500),
      });
      continue;
    }

    const { error: markSentError } = await admin
      .from("agency_rendition_backup_outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .in("id", claimed.map((row) => row.id));

    results.push({
      organization_id: organizationId,
      renditions: claimed.length,
      status: markSentError ? "sent_status_update_failed" : "sent",
    });
  }

  if (onlyRenditionId) {
    const result = results.find((item) => item.organization_id === organizationIdFilter);
    return reply({
      status: result?.status === "sent" ? "sent" : result?.status ?? "failed",
      date: dateInfo.displayDay,
      renditions: result?.renditions ?? 0,
      error: result?.error,
    });
  }

  return reply({
    status: "daily_close_processed",
    date: dateInfo.displayDay,
    batches: results,
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return reply({ error: "supabase_function_secrets_missing" }, 500);
  }

  let payload: {
    outbox_id?: string;
    rendition_id?: string;
    daily_close?: boolean;
    manual_close?: boolean;
    organization_id?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }

  const cronCandidate = request.headers.get("x-cron-secret") ?? "";

  const cronAuthorized =
    payload.daily_close === true &&
    await matchesDailyCloseSecret(cronCandidate);

  if (payload.daily_close === true && !cronAuthorized) {
    return reply({ error: "daily_close_forbidden" }, 403);
  }

  let userId = "";

  if (!cronAuthorized) {
    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return reply({ error: "authentication_required" }, 401);
    }

    const token = authorization.slice("Bearer ".length);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } =
      await userClient.auth.getUser(token);

    if (userError || !userData.user) {
      return reply({ error: "invalid_session" }, 401);
    }

    userId = userData.user.id;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (cronAuthorized) {
    return await sendDailyCloseBackups(admin, resendApiKey, resendFromEmail);
  }

  if (payload.manual_close === true) {
    const manualOrganizationId = String(payload.organization_id ?? "").trim();
    if (!manualOrganizationId) {
      return reply({ error: "organization_id_required_for_manual_backup" }, 400);
    }

    const { data: ownerMembership, error: ownerMembershipError } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", manualOrganizationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (ownerMembershipError || ownerMembership?.role !== "owner") {
      return reply({ error: "manual_backup_owner_only" }, 403);
    }

    return await sendDailyCloseBackups(
      admin,
      resendApiKey,
      resendFromEmail,
      manualOrganizationId,
    );
  }

  if (!payload.outbox_id && !payload.rendition_id) {
    return reply({ error: "outbox_id_or_rendition_id_required" }, 400);
  }

  const outboxQuery = payload.outbox_id
    ? admin
      .from("agency_rendition_backup_outbox")
      .select("*")
      .eq("id", payload.outbox_id)
    : admin
      .from("agency_rendition_backup_outbox")
      .select("*")
      .eq("rendition_id", payload.rendition_id as string)
      .order("revision_no", { ascending: false })
      .limit(1);

  const { data: outbox, error: outboxError } =
    await outboxQuery.maybeSingle();

  if (outboxError) {
    return reply({ error: "backup_lookup_failed" }, 500);
  }

  if (!outbox) {
    return reply({ error: "backup_not_found_or_not_configured" }, 404);
  }

  const { data: member, error: memberError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", outbox.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError || !member) {
    return reply({ error: "agency_access_denied" }, 403);
  }

  const manager = member.role === "owner";

  if (!manager) {
    return reply({
      error: "owner_only_backup_permission_required",
    }, 403);
  }

  if (outbox.status === "sent") {
    return reply({
      status: "sent",
      already_sent: true,
      sent_at: outbox.sent_at,
    });
  }

  if (!["pending", "failed", "sending"].includes(outbox.status)) {
    return reply({
      error: "backup_is_being_processed",
      status: outbox.status,
    }, 409);
  }

  // El reintento desde Personal envía esta rendición ahora, sin esperar al cierre.
  return await sendDailyCloseBackups(
    admin,
    resendApiKey,
    resendFromEmail,
    String(outbox.organization_id),
    String(outbox.rendition_id),
  );
});
