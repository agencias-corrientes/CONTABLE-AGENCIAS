"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function confirmationOrigin() {
  const hostname = window.location.hostname.toLowerCase();
  const isProjectDeployment = hostname.endsWith("-agencias-corrientes-project.vercel.app");
  const isCanonicalProduction = hostname === "contable-agencias.vercel.app";
  // Keep Preview recovery callbacks on the allow-listed, stable Preview alias.
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

    const supabase = createClient();
    const redirectTo = new URL("/auth/callback?flow=recovery", confirmationOrigin()).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

    if (error) {
      const details = error.message.toLowerCase();
      const status = (error as { status?: number }).status;
      console.error("[auth-recovery] request failed", {
        status,
        code: (error as { code?: string }).code,
        message: error.message,
      });

      if (status === 429 || details.includes("rate limit") || details.includes("too many requests")) {
        setMessage(
          "Se alcanzó el límite de envíos de correo de recuperación de Supabase. El servicio de correo integrado permite actualmente hasta 2 correos por hora. Revisá Recibidos y Spam: una solicitud anterior pudo haberse enviado. Esperá a que se restablezca el límite antes de volver a pedir el enlace."
        );
      } else if (details.includes("redirect") && (details.includes("allow") || details.includes("url"))) {
        setMessage(
          "Supabase rechazó la dirección de retorno del enlace. No sigas intentando: la dirección de recuperación debe autorizarse en la configuración de autenticación."
        );
      } else {
        setMessage("No se pudo solicitar el cambio de contraseña. Motivo informado por el servicio: " + error.message);
      }
      setLoading(false);
      return;
    }

    // Same public response whether the address exists or not.
    setSent(true);
    setMessage("Si ese correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Revisá también Spam o Correo no deseado.");
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/login?perfil=administrador" className="back-link">← Volver al ingreso</Link>
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">RECUPERAR ACCESO</p>
        <h1>Restablecer contraseña</h1>
        <p className="muted">Ingresá el correo de tu cuenta. Te enviaremos un enlace para elegir una contraseña nueva; no hace falta crear otra cuenta.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Correo electrónico
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          {message && <div className={"message" + (sent ? "" : " error-message")} role={sent ? "status" : "alert"}>{message}</div>}
          <button className="button primary full" disabled={loading}>{loading ? "Enviando..." : "Enviar enlace de recuperación"}</button>
        </form>
        <p className="muted small-text">¿Recordaste tu contraseña? <Link href="/login?perfil=administrador">Ingresar como administrador</Link>.</p>
      </div>
    </main>
  );
}
