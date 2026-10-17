"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EMAIL_SEND_COOLDOWN_KEY = "agencias-auth-email-send-cooldown-until";
const EMAIL_SEND_COOLDOWN_MS = 60 * 60 * 1000;

function confirmationRedirectTo() {
  const currentHost = window.location.hostname.toLowerCase();
  const isProjectDeployment = currentHost.endsWith("-agencias-corrientes-project.vercel.app");
  const isCanonicalProduction = currentHost === "contable-agencias.vercel.app";
  // Keep the approved Preview callback alias; production stays on its own domain.
  const confirmationOrigin =
    isProjectDeployment && !isCanonicalProduction
      ? "https://contable-agencias-git-previe-6d6939-agencias-corrientes-project.vercel.app"
      : window.location.origin;
  return new URL("/auth/callback", confirmationOrigin).toString();
}

function isEmailRateLimit(error: unknown) {
  const item = error as { message?: string; status?: number; code?: string };
  const detail = (item?.message ?? "").toLowerCase();
  const code = (item?.code ?? "").toLowerCase();
  return item?.status === 429 ||
    code.includes("rate_limit") ||
    detail.includes("rate limit") ||
    detail.includes("too many requests");
}

function isRedirectError(error: unknown) {
  const detail = ((error as { message?: string })?.message ?? "").toLowerCase();
  return detail.includes("redirect") || detail.includes("not allowed") || detail.includes("allow list");
}

export default function RegisterOwnerPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(EMAIL_SEND_COOLDOWN_KEY) ?? 0);
    if (stored > Date.now()) setRetryAfter(stored);
    else window.localStorage.removeItem(EMAIL_SEND_COOLDOWN_KEY);
  }, []);

  useEffect(() => {
    if (!retryAfter) return;
    const remaining = retryAfter - Date.now();
    if (remaining <= 0) {
      window.localStorage.removeItem(EMAIL_SEND_COOLDOWN_KEY);
      setRetryAfter(0);
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.removeItem(EMAIL_SEND_COOLDOWN_KEY);
      setRetryAfter(0);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  function startEmailCooldown() {
    const until = Date.now() + EMAIL_SEND_COOLDOWN_MS;
    window.localStorage.setItem(EMAIL_SEND_COOLDOWN_KEY, String(until));
    setRetryAfter(until);
  }

  function emailRateLimitMessage() {
    return "Supabase alcanzó el límite temporal de correos de autenticación. La cuenta puede haber quedado creada, pero sin correo de confirmación. No vuelvas a crearla ni a pedir correos mientras el bloqueo siga activo. Esperá a que termine el contador y luego usá «Reenviar correo de confirmación».";
  }

  async function resendConfirmation() {
    if (loading || retryAfter > Date.now()) return;
    const cleanedEmail = email.trim();
    if (!cleanedEmail) {
      setMessage("Ingresá el correo que usaste para crear la cuenta.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: cleanedEmail,
        options: { emailRedirectTo: confirmationRedirectTo() },
      });

      if (error) {
        if (isEmailRateLimit(error)) {
          startEmailCooldown();
          setMessage(emailRateLimitMessage());
        } else if (isRedirectError(error)) {
          setMessage("Supabase rechazó la dirección de retorno del Preview. La URL de confirmación debe estar autorizada en Authentication → URL Configuration.");
        } else {
          setMessage("No se pudo reenviar la confirmación. Revisá el correo e intentá nuevamente cuando el servicio esté disponible.");
        }
        setLoading(false);
        return;
      }

      setWaiting(true);
      setMessage("Si el correo corresponde a una cuenta pendiente de confirmación, recibirás un enlace. Revisá Recibidos y Spam.");
    } catch {
      setMessage("No se pudo conectar con el servicio de autenticación. Revisá la conexión e intentá nuevamente.");
    }
    setLoading(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setAccountExists(false);
    setShowResendConfirmation(false);

    if (retryAfter > Date.now()) {
      setShowResendConfirmation(true);
      setMessage(emailRateLimitMessage());
      return;
    }

    if (password.length < 8 || password !== confirmation) {
      setMessage(password.length < 8 ? "La contraseña debe tener al menos 8 caracteres." : "Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: confirmationRedirectTo() },
      });

      if (error) {
        const detail = error.message.toLowerCase();
        if (isEmailRateLimit(error)) {
          startEmailCooldown();
          setShowResendConfirmation(true);
          setMessage(emailRateLimitMessage());
        } else if (detail.includes("already registered") || detail.includes("already been registered")) {
          setAccountExists(true);
          setShowResendConfirmation(true);
          setMessage("Ese correo ya está registrado. No intentes crear otra cuenta con el mismo correo. Ingresá o recuperá el acceso; si quedó pendiente de confirmar, reenviá la confirmación.");
        } else if (isRedirectError(error)) {
          setMessage("La URL de confirmación fue rechazada por Supabase. Hay que autorizar la dirección de retorno de este Preview.");
        } else if (detail.includes("password")) {
          setMessage("Supabase rechazó la contraseña. Usá al menos 8 caracteres y evitá una contraseña que el servicio considere débil.");
        } else if (detail.includes("invalid email")) {
          setMessage("El correo no tiene un formato válido. Revisalo e intentá nuevamente.");
        } else {
          setMessage("Supabase no pudo crear la cuenta. Revisá el correo, la conexión y volvé a intentarlo cuando el servicio esté disponible.");
        }
        setLoading(false);
        return;
      }

      // Supabase may hide already-registered emails by returning no identities.
      if (data.user && !data.session && (data.user.identities?.length ?? 0) === 0) {
        setAccountExists(true);
        setShowResendConfirmation(true);
        setMessage("Ese correo ya tiene una cuenta. No hace falta crear otra: ingresá o recuperá el acceso. Si falta confirmar el correo, podés reenviar la confirmación.");
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push("/setup");
        router.refresh();
        return;
      }
      setWaiting(true);
      setMessage("Te enviamos un correo de confirmación. Abrilo para continuar con la configuración de tu agencia.");
    } catch {
      setMessage("No se pudo conectar con el servicio de autenticación. Revisá la conexión e intentá nuevamente.");
    }
    setLoading(false);
  }

  const cooldownActive = retryAfter > Date.now();
  const cooldownMinutes = cooldownActive ? Math.ceil((retryAfter - Date.now()) / 60000) : 0;

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="back-link">← Volver</Link>
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">ALTA DEL TITULAR</p>
        <h1>Crear cuenta de propietario</h1>
        <p className="muted">Usá el correo que querés emplear para ingresar. Cada titular tendrá su propia agencia, separada de las demás.</p>
        {!waiting ? (
          <form onSubmit={submit} className="form-stack">
            <label>Nombre completo<input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" /></label>
            <label>Correo electrónico de acceso<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
            <label>Crear contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
            <label>Repetir contraseña<input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
            {message && (
              <div className="message error-message" role="alert">
                {message}
                {accountExists && <> <Link href="/login?perfil=administrador">Ingresar como administrador</Link> · <Link href="/recuperar">Recuperar acceso</Link>.</>}
                {showResendConfirmation && !accountExists && <> <Link href="/recuperar">Recuperar acceso</Link>.</>}
                {cooldownActive && <p className="small-text">Podrás solicitar otro correo en aproximadamente {cooldownMinutes} minuto(s). La espera es preventiva para evitar más rechazos del servicio.</p>}
              </div>
            )}
            {showResendConfirmation && (
              <button type="button" className="button ghost full" onClick={() => void resendConfirmation()} disabled={loading || cooldownActive}>
                {loading ? "Procesando..." : cooldownActive ? "Confirmación temporalmente bloqueada" : "Reenviar correo de confirmación"}
              </button>
            )}
            <button className="button primary full" disabled={loading || cooldownActive}>
              {loading ? "Creando cuenta..." : cooldownActive ? "Esperá antes de volver a intentarlo" : "Crear cuenta y continuar"}
            </button>
          </form>
        ) : (
          <div className="message" role="status">
            {message}
            <p><Link href="/login?perfil=administrador">Ir al inicio de sesión</Link> · <Link href="/recuperar">Recuperar acceso</Link></p>
          </div>
        )}
        <p className="muted small-text">¿Ya tenés cuenta? <Link href="/login?perfil=administrador">Ingresar</Link></p>
      </div>
    </main>
  );
}
