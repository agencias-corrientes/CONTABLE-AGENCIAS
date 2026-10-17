"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function recoveryOrigin() {
  const hostname = window.location.hostname.toLowerCase();
  const isProjectDeployment = hostname.endsWith("-agencias-corrientes-project.vercel.app");
  const isCanonicalProduction = hostname === "contable-agencias.vercel.app";

  // Supabase has an existing allow-listed preview callback hostname. It will be
  // reassigned to this production-based preview so the reset link returns here.
  return isProjectDeployment && !isCanonicalProduction
    ? "https://contable-agencias-git-previe-6d6939-agencias-corrientes-project.vercel.app"
    : window.location.origin;
}

export default function RecoverAccountPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSent(false);
    setLoading(true);

    try {
      const supabase = createClient();
      // Use the allow-listed preview callback hostname; Vercel will route that alias
      // to this deployment while we test password recovery.
      const redirectTo = new URL("/auth/callback?flow=recovery", recoveryOrigin()).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

      if (error) {
        const details = error.message.toLowerCase();
        const status = (error as { status?: number }).status;

        if (status === 429 || details.includes("rate limit") || details.includes("too many requests")) {
          setMessage("El servicio limitó temporalmente los correos de recuperación. Revisá Recibidos y Spam, esperá un poco y luego volvé a intentarlo.");
        } else if (
          details.includes("redirect") ||
          details.includes("not allowed") ||
          details.includes("allow list")
        ) {
          setMessage("Supabase rechazó la dirección de retorno de este Preview. Hay que autorizar la URL de Preview en Authentication → URL Configuration para que el enlace vuelva a esta versión.");
        } else {
          setMessage("No se pudo solicitar el cambio de contraseña. Revisá el correo ingresado e intentá nuevamente más tarde.");
        }
        setLoading(false);
        return;
      }

      // The same message is shown whether the email exists or not, avoiding account enumeration.
      setSent(true);
      setMessage("Si ese correo tiene una cuenta, se enviará un enlace para elegir una contraseña nueva. Revisá también Spam o Correo no deseado.");
    } catch {
      setMessage("No se pudo conectar con el servicio de autenticación. Revisá la conexión e intentá nuevamente.");
    }

    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/login?perfil=administrador" className="back-link">← Volver al ingreso</Link>
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">RECUPERAR ACCESO</p>
        <h1>Restablecer contraseña</h1>
        <p className="muted">Ingresá el correo de tu cuenta existente. Te enviaremos un enlace para crear una contraseña nueva; no hace falta registrar otra cuenta.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Correo electrónico
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          {message && <div className={"message" + (sent ? " success-message" : " error-message")} role={sent ? "status" : "alert"}>{message}</div>}
          <button className="button primary full" disabled={loading}>{loading ? "Enviando..." : "Enviar enlace de recuperación"}</button>
        </form>
        <p className="muted small-text">¿Recordaste tu contraseña? <Link href="/login?perfil=administrador">Volver a ingresar</Link>.</p>
      </div>
    </main>
  );
}
