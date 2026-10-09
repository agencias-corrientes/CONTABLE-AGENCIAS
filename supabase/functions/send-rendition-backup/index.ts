import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
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

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply({ error: "authentication_required" }, 401);
  const token = authorization.slice("Bearer ".length);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return reply({ error: "invalid_session" }, 401);
  const userId = userData.user.id;

  let payload: { outbox_id?: string; rendition_id?: string };
  try {
    payload = await request.json();
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }
  if (!payload.outbox_id && !payload.rendition_id) {
    return reply({ error: "outbox_id_or_rendition_id_required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  if (!["pending", "failed"].includes(outbox.status)) {
    return reply({ error: "backup_is_being_processed", status: outbox.status }, 409);
  }

  // Keep a complete text backup in the outbox even when the mail provider is not configured.
  if (!resendApiKey || !fromEmail) {
    return reply({
      error: "email_provider_not_configured",
      status: outbox.status,
      message: "Configure RESEND_API_KEY and RESEND_FROM_EMAIL in Supabase Edge Function secrets.",
    }, 503);
  }

  const { data: claimed, error: claimError } = await admin
    .from("agency_rendition_backup_outbox")
    .update({
      status: "sending",
      attempt_count: Number(outbox.attempt_count ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", outbox.id)
    .eq("status", outbox.status)
    .select("id,recipient_email,subject,text_body")
    .maybeSingle();

  if (claimError) return reply({ error: "backup_claim_failed" }, 500);
  if (!claimed) {
    const { data: current } = await admin
      .from("agency_rendition_backup_outbox")
      .select("status,sent_at")
      .eq("id", outbox.id)
      .maybeSingle();
    return reply({ status: current?.status ?? "unknown", already_sent: current?.status === "sent", sent_at: current?.sent_at });
  }

  const attachments: { filename: string; content: string }[] = [];
  let textBody = claimed.text_body;
  if (outbox.ticket_photo_path) {
    const { data: photoData, error: photoError } = await admin.storage.from("agency-rendition-tickets").download(outbox.ticket_photo_path);
    if (!photoError && photoData) {
      try {
        const bytes = new Uint8Array(await photoData.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        const extension = outbox.ticket_photo_path.endsWith(".png") ? "png" : outbox.ticket_photo_path.endsWith(".webp") ? "webp" : "jpg";
        attachments.push({ filename: "ticket-rendicion." + extension, content: btoa(binary) });
      } catch {
        textBody += "\\nNOTA: no se pudo adjuntar la foto; se envía el respaldo de texto.";
      }
    } else {
      textBody += "\\nNOTA: no se pudo recuperar la foto; se envía el respaldo de texto.";
    }
  }

  let providerResponse: Response;
  let providerText = "";
  try {
    providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [claimed.recipient_email],
        subject: claimed.subject,
        text: textBody,
        ...(attachments.length ? { attachments } : {}),
      }),
      signal: AbortSignal.timeout(20000),
    });
    providerText = await providerResponse.text();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "Network error";
    await admin.from("agency_rendition_backup_outbox").update({
      status: "failed",
      last_error: reason.slice(0, 1000),
    }).eq("id", claimed.id);
    return reply({ error: "email_delivery_failed", detail: reason }, 502);
  }

  if (!providerResponse.ok) {
    await admin.from("agency_rendition_backup_outbox").update({
      status: "failed",
      last_error: providerText.slice(0, 1000) || "Mail provider rejected the request",
    }).eq("id", claimed.id);
    return reply({ error: "email_provider_rejected", detail: providerText.slice(0, 500) }, 502);
  }

  const { error: updateError } = await admin.from("agency_rendition_backup_outbox").update({
    status: "sent",
    sent_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", claimed.id);
  if (updateError) return reply({ error: "email_sent_but_status_update_failed" }, 500);

  let providerId: string | null = null;
  try { providerId = JSON.parse(providerText)?.id ?? null; } catch { /* provider response is optional */ }
  return reply({ status: "sent", provider_id: providerId, recipient: claimed.recipient_email });
});
