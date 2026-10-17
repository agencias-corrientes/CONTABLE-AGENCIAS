"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
      // Return the recovery link to this exact deployment. Hard-coding an old Preview
      // made Production recovery links open a different deployment and could lose the session.
      const redirectTo = new URL(
        "/auth/callback?next=%2Fcambiar-clave",
        window.location.origin,
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
      setMessage("Si ese correo pertenece a una cuenta, recibirás un enlace «Reset Password». Abrilo una sola vez, en este mismo navegador, para elegir la contraseña nueva. Usá el correo más reciente y revisá también Spam.");
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
