"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/cambiar-clave")}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      setStatus(error ? "error" : "sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/login?perfil=administrador" className="back-link">← Volver al ingreso</Link>
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">RECUPERACIÓN DE ACCESO</p>
        <h1>Recuperar contraseña</h1>
        <p className="muted">Ingresá el correo de tu cuenta. Te enviaremos un enlace para elegir una contraseña nueva.</p>
        {status === "sent" ? (
          <div className="form-stack">
            <p className="message success-message">Si el correo corresponde a una cuenta registrada, recibirás un enlace de recuperación. Revisá también la carpeta de spam.</p>
            <Link className="button primary full" href="/login?perfil=administrador">Volver al ingreso</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="form-stack">
            <label>Correo electrónico
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
            </label>
            {status === "error" && <p className="message error-message" role="alert">No pudimos enviar el correo de recuperación. Esperá un momento e intentá nuevamente.</p>}
            <button className="button primary full" disabled={status === "sending"}>{status === "sending" ? "Enviando..." : "Enviar enlace de recuperación"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
