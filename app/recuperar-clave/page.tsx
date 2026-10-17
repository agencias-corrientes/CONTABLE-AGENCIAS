"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const RECOVERY_PREVIEW_ORIGIN =
  "https://contable-agencias-git-previe-6d6939-agencias-corrientes-project.vercel.app";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSent(false);
    setMessage("");

    try {
      const supabase = createClient();
      // The current Supabase recovery template sends a Reset Password link, not an OTP.
      // Return that link to the password form through the allow-listed Preview callback.
      const redirectTo = new URL(
        "/auth/callback?next=%2Fcambiar-clave",
        RECOVERY_PREVIEW_ORIGIN,
      ).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo },
      );

      if (error) {
        const details = error.message.toLowerCase();
        const status = (error as { status?: number }).status;
        if (status === 429 || details.includes("rate limit") || details.includes("too many requests")) {
          setMessage("Supabase limitó temporalmente los correos. No vuelvas a solicitarlo repetidamente: esperá a que se levante el límite y usá el correo más reciente.");
        } else if (details.includes("redirect") || details.includes("not allowed") || details.includes("allow list")) {
          setMessage("Supabase rechazó la dirección de retorno del Preview. La URL de recuperación debe estar autorizada en Authentication → URL Configuration.");
        } else {
          setMessage("No se pudo solicitar el enlace de recuperación. Revisá el correo e intentá nuevamente más tarde.");
        }
        return;
      }

      setSent(true);
      setMessage("Si ese correo pertenece a una cuenta, recibirás un enlace «Reset Password». Abrilo desde este Preview y en el mismo navegador para elegir la contraseña nueva. Revisá también Spam.");
    } catch {
      setMessage("No se pudo conectar con el servicio de autenticación. Revisá la conexión e intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/login?perfil=administrador" className="back-link">← Volver al ingreso</Link>
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">RECUPERACIÓN DE ACCESO</p>
        <h1>Recuperar contraseña</h1>
        <p className="muted">Ingresá el correo de tu cuenta. Te enviaremos un enlace «Reset Password» para abrir el formulario y guardar una contraseña nueva. No hace falta crear otra cuenta ni ingresar un código.</p>
        <form onSubmit={requestRecovery} className="form-stack">
          <label>Correo electrónico
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          {message && <p className={"message " + (sent ? "success-message" : "error-message")} role={sent ? "status" : "alert"}>{message}</p>}
          <button className="button primary full" disabled={busy}>{busy ? "Enviando..." : "Enviar enlace de recuperación"}</button>
        </form>
        <p className="muted small-text">¿Recordaste tu contraseña? <Link href="/login?perfil=administrador">Volver a ingresar</Link>.</p>
      </section>
    </main>
  );
}
