import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz4sFO9eo0FaCjl76Og5-aYceYzdfyibpDwBnZTNtnvz1Qm_tfjwg0x47Uck4JAzCo-fA/exec";

type User = { email?: string };
type EmailData = {
  token?: string;
  token_hash?: string;
  redirect_to?: string;
  email_action_type?: string;
  site_url?: string;
  token_new?: string;
  token_hash_new?: string;
};
type HookEvent = { user?: User; email_data?: EmailData };

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function subjectFor(action: string): string {
  switch (action) {
    case "signup": return "Confirmá tu correo - Agencias Corrientes";
    case "recovery": return "Restablecé tu contraseña - Agencias Corrientes";
    case "invite": return "Invitación - Agencias Corrientes";
    case "magiclink": return "Tu enlace de acceso - Agencias Corrientes";
    case "email_change": return "Confirmación de cambio de correo - Agencias Corrientes";
    case "reauthentication": return "Confirmá tu identidad - Agencias Corrientes";
    case "email": return "Confirmá tu correo - Agencias Corrientes";
    default: return "Agencias Corrientes";
  }
}
function headingFor(action: string): string {
  switch (action) {
    case "signup": return "Confirmá tu correo electrónico";
    case "recovery": return "Restablecé tu contraseña";
    case "invite": return "Tenés una invitación";
    case "magiclink": return "Ingresá a Agencias Corrientes";
    case "email_change": return "Confirmá el cambio de correo";
    case "reauthentication": return "Confirmá tu identidad";
    case "email": return "Confirmá tu correo electrónico";
    default: return "Agencias Corrientes";
  }
}
function verificationUrl(authUrl: string, tokenHash: string, action: string, redirectTo: string): string {
  const url = new URL("/auth/v1/verify", authUrl);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", action);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

// For sign-up confirmations, avoid consuming one-time tokens on an automatic
// GET request from an email security scanner. The app verifies only after the
// person presses the confirmation button on /auth/confirm-email.
function confirmationLandingUrl(tokenHash: string, action: string, redirectTo: string, siteUrl: string): string {
  let origin = "https://contable-agencias.vercel.app";
  for (const candidate of [redirectTo, siteUrl]) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:" || parsed.hostname === "localhost") {
        origin = parsed.origin;
        break;
      }
    } catch {
      // Use the configured production fallback for an invalid redirect URL.
    }
  }
  const url = new URL("/auth/confirm-email", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", action);
  return url.toString();
}
function emailBodies(action: string, link: string, token?: string) {
  const heading = headingFor(action);
  const text = heading + "\n\nAbrí este enlace para continuar:\n" + link +
    (token ? "\n\nCódigo de un solo uso: " + token : "") +
    "\n\nSi no solicitaste esta operación, podés ignorar este correo.\nAgencias Corrientes";
  const html = '<!doctype html><html lang="es"><meta charset="utf-8"><body style="margin:0;background:#f4f1eb;font-family:Arial,Helvetica,sans-serif;color:#30272a;padding:24px 10px">' +
    '<main style="max-width:560px;margin:auto;background:#fff;border:1px solid #e6ded0">' +
    '<div style="height:7px;background:#ffdf00"></div>' +
    '<header style="background:#6b283b;color:#fff;padding:22px 24px"><div style="color:#ffdf00;font-size:12px;font-weight:bold;letter-spacing:1px">AGENCIAS CORRIENTES</div>' +
    '<h1 style="font-size:23px;line-height:1.3;margin:12px 0 0">' + escapeHtml(heading) + '</h1></header>' +
    '<section style="padding:26px 24px;font-size:15px;line-height:1.6"><p>Hola,</p><p>Para continuar con tu solicitud, usá este enlace seguro:</p>' +
    '<p style="margin:26px 0"><a href="' + escapeHtml(link) + '" style="display:inline-block;background:#ffdf00;color:#30272a;text-decoration:none;font-weight:bold;padding:13px 20px;border-radius:4px">Continuar</a></p>' +
    '<p>Si el botón no funciona, copiá y pegá esta dirección en el navegador:</p><p style="font-size:12px;overflow-wrap:anywhere"><a href="' + escapeHtml(link) + '">' + escapeHtml(link) + '</a></p>' +
    (token ? '<p>Código de un solo uso: <strong>' + escapeHtml(token) + '</strong></p>' : '') +
    '<p>Si no solicitaste esta operación, podés ignorar este correo.</p></section>' +
    '<footer style="background:#f8f5ef;padding:14px 24px;font-size:11px;color:#7a7068">Mensaje automático de Agencias Corrientes.</footer></main></body></html>';
  return { text, html };
}
async function deliver(tokenSecret: string, to: string, action: string, link: string, otp?: string): Promise<void> {
  const bodies = emailBodies(action, link, otp);
  let response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ secret: tokenSecret, to, subject: subjectFor(action), text: bodies.text, html: bodies.html }),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  let redirectHops = 0;
  while ([301, 302, 303, 307, 308].includes(response.status) && redirectHops < 5) {
    const location = response.headers.get("location");
    if (!location) break;
    const nextUrl = new URL(location, APPS_SCRIPT_URL);
    if (nextUrl.origin === new URL(APPS_SCRIPT_URL).origin &&
        nextUrl.pathname.includes("/macros/s/") && nextUrl.pathname.endsWith("/exec")) {
      console.error("Apps Script redirect loop detected");
      break;
    }
    redirectHops++;
    response = await fetch(nextUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
  }
  const responseText = await response.text();
  let result: { ok?: boolean; error?: string } = {};
  try { result = JSON.parse(responseText); } catch { /* response may be a Google HTML error */ }
  if (!response.ok || result.ok !== true) {
    console.error("Apps Script delivery failed", JSON.stringify({
      status: response.status,
      redirectHops,
      contentType: response.headers.get("content-type") ?? "",
      error: result.error ?? "non_json_or_invalid_response",
    }));
    throw new Error("El servicio de correo gratuito rechazó el envío.");
  }
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: { http_code: 405, message: "Método no permitido." } }, 405);
  const hookSecretRaw = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
  const mailToken = Deno.env.get("AGENCY_MAIL_TOKEN") ?? "";
  const authUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!hookSecretRaw || !mailToken || !authUrl) {
    console.error("Missing SEND_EMAIL_HOOK_SECRET, AGENCY_MAIL_TOKEN, or SUPABASE_URL");
    return json({ error: { http_code: 500, message: "Servicio de correo no configurado." } }, 500);
  }
  const payload = await req.text();
  let event: HookEvent;
  try {
    const hookSecret = hookSecretRaw.replace(/^v1,whsec_/, "");
    event = new Webhook(hookSecret).verify(payload, Object.fromEntries(req.headers)) as HookEvent;
  } catch {
    return json({ error: { http_code: 401, message: "Firma de solicitud inválida." } }, 401);
  }
  const user = event.user;
  const data = event.email_data;
  const action = String(data?.email_action_type ?? "");
  const supported = new Set(["signup", "recovery", "invite", "magiclink", "email_change", "email", "reauthentication"]);
  if (!user || !data || !supported.has(action)) {
    return json({ error: { http_code: 400, message: "Evento de correo no compatible." } }, 400);
  }
  const recipient = String(user.email || "").trim();
  const tokenHash = String(data.token_hash || "");
  if (!recipient || !tokenHash) {
    return json({ error: { http_code: 400, message: "Falta el destinatario o el token de confirmación." } }, 400);
  }
  const redirectTo = String(data.redirect_to || "");
  const siteUrl = String(data.site_url || "");
  const link = action === "signup"
    ? confirmationLandingUrl(tokenHash, action, redirectTo, siteUrl)
    : verificationUrl(authUrl, tokenHash, action, redirectTo);
  try {
    await deliver(mailToken, recipient, action, link, String(data.token || ""));
    return json({});
  } catch {
    return json({ error: { http_code: 502, message: "No se pudo enviar el correo de autenticación." } }, 502);
  }
});