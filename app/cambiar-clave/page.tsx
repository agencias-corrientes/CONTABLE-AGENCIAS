"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type PageStatus = "checking" | "ready" | "invalid" | "saving" | "updated" | "error";

export default function UpdatePasswordPage() {
  const [status, setStatus] = useState<PageStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const checkRecoverySession = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        setStatus(!error && data.session ? "ready" : "invalid");
      } catch {
        if (active) setStatus("invalid");
      }
    };
    void checkRecoverySession();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("La contraseña debe tener al menos 8 caracteres.");
      setStatus("error");
      return;
    }
    if (password !== confirmation) {
      setMessage("Las contraseñas no coinciden.");
      setStatus("error");
      return;
    }

    setStatus("saving");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage("No pudimos actualizar la contraseña. Es posible que el enlace haya vencido; solicitá uno nuevo.");
        setStatus("error");
        return;
      }
      await supabase.auth.signOut();
      setPassword("");
      setConfirmation("");
      setStatus("updated");
    } catch {
      setMessage("No pudimos actualizar la contraseña. Solicitá un enlace nuevo e intentá nuevamente.");
      setStatus("error");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/login?perfil=administrador" className="back-link">← Volver al ingreso</Link>
        <div className="brand-logo-wrap brand-logo-top-left auth-page-logo"><Image src="/agencias-corrientes-app.svg" alt="Agencias Corrientes — Quiniela Oficial" width={76} height={76} priority /></div>
        <p className="eyebrow">RECUPERACIÓN DE ACCESO</p>
        <h1>Elegir contraseña nueva</h1>
        {status === "checking" && <p className="muted">Verificando el enlace de recuperación…</p>}
        {status === "invalid" && (
          <div className="form-stack">
            <p className="message error-message">Este enlace no pudo validarse en este navegador; puede haber vencido o ya haberse utilizado. Volvé a solicitar uno nuevo y abrilo una sola vez en el mismo navegador y dispositivo desde donde pediste el correo de recuperación. No hace falta crear otra cuenta.</p>
            <Link className="button primary full" href="/recuperar-clave">Solicitar otro enlace</Link>
          </div>
        )}
        {status === "updated" && (
          <div className="form-stack">
            <p className="message success-message">Contraseña actualizada. Ahora podés ingresar con tu nueva contraseña.</p>
            <Link className="button primary full" href="/login?perfil=administrador&recuperada=1">Ingresar</Link>
          </div>
        )}
        {["ready", "saving", "error"].includes(status) && (
          <form onSubmit={submit} className="form-stack">
            <label>Nueva contraseña
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete="new-password" />
            </label>
            <label>Repetir nueva contraseña
              <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required autoComplete="new-password" />
            </label>
            {message && <p className="message error-message" role="alert">{message}</p>}
            <button className="button primary full" disabled={status === "saving"}>{status === "saving" ? "Guardando..." : "Guardar nueva contraseña"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
