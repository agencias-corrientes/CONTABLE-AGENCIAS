import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}


const DAILY_CLOSE_CRON_SECRET_SHA256 = "eb9a0fcfbf3e942ea3530ced14b5976aff59c6a64f426d10577a875ac804cceb";
const AGENCY_TIME_ZONE = "America/Argentina/Buenos_Aires";

async function matchesDailyCloseSecret(candidate: string): Promise<boolean> {
  if (!candidate) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate));
  const value = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return value === DAILY_CLOSE_CRON_SECRET_SHA256;
}

function agencyDateInfo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AGENCY_TIME_ZONE,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "00";
  return {
    isoDay: part("year") + "-" + part("month") + "-" + part("day"),
    displayDay: part("day") + "/" + part("month") + "/" + part("year"),
    timestamp: part("day") + "/" + part("month") + "/" + part("year") + " " + part("hour") + ":" + part("minute") + ":" + part("second") + " (Buenos Aires, Argentina)",
  };
}

function normalizeBackupText(rawText: string): string {
  return rawText.replace(/\\\\\\\\n/g, "\n").replace(/\\\\n/g, "\n").replace(/\r\n?/g, "\n");
}

function formatDailyBackupItem(rawText: string, createdAt: string): string {
  let normalized = normalizeBackupText(rawText);
  normalized = normalized.replace(/Fecha del juego: (\d{4})-(\d{2})-(\d{2})/g, (_match, year, month, day) => "Fecha del juego: " + day + "/" + month + "/" + year);
  const date = new Date(createdAt);
  if (!Number.isNaN(date.getTime())) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: AGENCY_TIME_ZONE,
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
    const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "00";
    const stamp = part("day") + "/" + part("month") + "/" + part("year") + " " + part("hour") + ":" + part("minute") + ":" + part("second") + " (Buenos Aires, Argentina)";
    normalized = normalized.replace(/Registrada: [^\n\r]+/, "Registrada: " + stamp);
  }
  return normalized;
}

async function sendDailyCloseBackups(admin: any, resendApiKey: string | undefined, fromEmail: string | undefined) {
  if (!resendApiKey || !fromEmail) {
    return reply({ error: "email_provider_not_configured", message: "Configure RESEND_API_KEY y RESEND_FROM_EMAIL en los secretos de la función Supabase." }, 503);
  }

  const now = new Date();
  const dateInfo = agencyDateInfo(now);
  const { data: allRows, error: lookupError } = await admin
    .from("agency_rendition_backup_outbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (lookupError) return reply({ error: "daily_backup_lookup_failed" }, 500);
  if ((allRows ?? []).length >= 10000) {
    return reply({ error: "daily_backup_history_limit_reached", message: "Se alcanzó el límite de lectura; no se envió una copia parcial." }, 500);
  }

  // Keep only the latest revision of each rendition so corrections don't appear twice.
  const latestByRendition = new Map<string, any>();
  for (const row of allRows ?? []) {
    const key = String(row.rendition_id);
    const previous = latestByRendition.get(key);
    if (!previous || Number(row.revision_no ?? 1) > Number(previous.revision_no ?? 1)) latestByRendition.set(key, row);
  }
  const retryBefore = now.getTime() - 20 * 60 * 1000;
  const pendingRows = Array.from(latestByRendition.values()).filter((row) => {
    if (row.status === "pending" || row.status === "failed") return true;
    return row.status === "sending" && Date.parse(String(row.last_attempt_at ?? row.created_at ?? "")) < retryBefore;
  }).sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));

  if (!pendingRows.length) return reply({ status: "nothing_to_send", date: dateInfo.displayDay, renditions: 0 });

  const batches = new Map<string, any[]>();
  for (const row of pendingRows) {
    const key = String(row.organization_id);
    batches.set(key, [...(batches.get(key) ?? []), row]);
  }

  const results: { organization_id: string; renditions: number; status: string }[] = [];
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

    claimed.sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)));
    const recipient = String(claimed[claimed.length - 1].recipient_email ?? "").trim();
    if (!recipient) {
      await admin.from("agency_rendition_backup_outbox").update({
        status: "failed", last_error: "No hay correo de respaldo configurado para el cierre diario.",
      }).in("id", claimed.map((row) => row.id));
      results.push({ organization_id: organizationId, renditions: claimed.length, status: "failed_no_recipient" });
      continue;
    }

    const sections = claimed.map((row, index) =>
      "========== RENDICIÓN " + (index + 1) + " DE " + claimed.length + " ==========\n" +
      formatDailyBackupItem(String(row.text_body ?? "(sin detalle de respaldo)"), String(row.created_at ?? now.toISOString()))
    );
    let textBody = "BACKUP DIARIO DE RENDICIONES - AGENCIAS CORRIENTES\n" +
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
      const { data: photoData, error: photoError } = await admin.storage.from("agency-rendition-tickets").download(row.ticket_photo_path);
      if (photoError || !photoData) { omittedPhotos++; continue; }
      try {
        const bytes = new Uint8Array(await photoData.arrayBuffer());
        if (totalAttachmentBytes + bytes.length > maxAttachmentBytes) { omittedPhotos++; continue; }
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        const extension = String(row.ticket_photo_path).endsWith(".png") ? "png" : String(row.ticket_photo_path).endsWith(".webp") ? "webp" : "jpg";
        attachments.push({ filename: "ticket-rendicion-" + (index + 1) + "." + extension, content: btoa(binary) });
        totalAttachmentBytes += bytes.length;
      } catch { omittedPhotos++; }
    }
    if (omittedPhotos) textBody += "\n\nNOTA: " + omittedPhotos + " foto(s) no se adjuntaron al correo por no estar disponibles o superar el límite total de adjuntos; los datos de las rendiciones están incluidos.";

    let providerResponse: Response;
    let providerText = "";
    try {
      providerResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + resendApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient],
          subject: "Backup diario de rendiciones - " + dateInfo.displayDay,
          text: textBody,
          html: formatBackupHtml(textBody),
          ...(attachments.length ? { attachments } : {}),
        }),
        signal: AbortSignal.timeout(25000),
      });
      providerText = await providerResponse.text();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Network error";
      await admin.from("agency_rendition_backup_outbox").update({ status: "failed", last_error: reason.slice(0, 1000) }).in("id", claimed.map((row) => row.id));
      results.push({ organization_id: organizationId, renditions: claimed.length, status: "failed" });
      continue;
    }

    if (!providerResponse.ok) {
      const reason = providerText.slice(0, 1000) || "Mail provider rejected the request";
      await admin.from("agency_rendition_backup_outbox").update({ status: "failed", last_error: reason }).in("id", claimed.map((row) => row.id));
      results.push({ organization_id: organizationId, renditions: claimed.length, status: "failed" });
      continue;
    }

    const { error: markSentError } = await admin.from("agency_rendition_backup_outbox").update({
      status: "sent", sent_at: new Date().toISOString(), last_error: null,
    }).in("id", claimed.map((row) => row.id));
    results.push({ organization_id: organizationId, renditions: claimed.length, status: markSentError ? "sent_status_update_failed" : "sent" });
  }

  return reply({ status: "daily_close_processed", date: dateInfo.displayDay, batches: results });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");

  if (!supabaseUrl || !anonKey || !serviceKey) return reply({ error: "supabase_function_secrets_missing" }, 500);

  let payload: { outbox_id?: string; rendition_id?: string; daily_close?: boolean };
  try {
    payload = await request.json();
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }

  const cronCandidate = request.headers.get("x-cron-secret") ?? "";
  const cronAuthorized = payload.daily_close === true && await matchesDailyCloseSecret(cronCandidate);
  if (payload.daily_close === true && !cronAuthorized) return reply({ error: "daily_close_forbidden" }, 403);

  let userId = "";
  if (!cronAuthorized) {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "authentication_required" }, 401);
    const token = authorization.slice("Bearer ".length);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return reply({ error: "invalid_session" }, 401);
    userId = userData.user.id;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (cronAuthorized) return await sendDailyCloseBackups(admin, resendApiKey, fromEmail);
  if (!payload.outbox_id && !payload.rendition_id) return reply({ error: "outbox_id_or_rendition_id_required" }, 400);
  const outboxQuery = payload.outbox_id
    ? admin.from("agency_rendition_backup_outbox").select("*").eq("id", payload.outbox_id)
    : admin.from("agency_rendition_backup_outbox").select("*").eq("rendition_id", payload.rendition_id as string).order("revision_no", { ascending: false }).limit(1);
  const { data: outbox, error: outboxError } = await outboxQuery.maybeSingle();
  if (outboxError) return reply({ error: "backup_lookup_failed" }, 500);
  if (!outbox) return reply({ error: "backup_not_found_or_not_configured" }, 404);

  const { data: member, error: memberError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", outbox.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError || !member) return reply({ error: "agency_access_denied" }, 403);

  const manager = member.role === "owner";
  if (!manager) return reply({ error: "owner_only_backup_permission_required" }, 403);

  if (outbox.status === "sent") {
    return reply({ status: "sent", already_sent: true, sent_at: outbox.sent_at });
  }
  if (!["pending", "failed", "sending"].includes(outbox.status)) {
    return reply({ error: "backup_is_being_processed", status: outbox.status }, 409);
  }

  // No per-rendition email: the scheduled close sends all current revisions together.
  return reply({
    status: "queued",
    deferred_to_daily_close: true,
    message: "La copia quedó acumulada para el único correo de cierre diario.",
    outbox_id: outbox.id,
  });
});
