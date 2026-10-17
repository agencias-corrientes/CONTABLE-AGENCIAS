"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type RecoveryStep = "request" | "code" | "password" | "updated";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [step, setStep] = useState<RecoveryStep>("request");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
      if (error) {
        setMessage(error.status === 429
          ? "Se solicitaron demasiados correos en poco tiempo. Esperá unos minutos antes de volver a intentarlo."
          : "No pudimos enviar el código. Revisá el correo y volvé a intentarlo.");
        return;
      }
      setStep("code");
    } catch {
      setMessage("No pudimos enviar el código. Volvé a intentarlo.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: token.trim().replace(/\s/g, ""),
        type: "recovery",
      });
      if (error) {
        setMessage("El código no es válido o venció. Usá el código del correo más reciente o solicitá uno nuevo.");
        return;
      }
      setStep("password");
    } catch {
      setMessage("No pudimos validar el código. Solicitá uno nuevo e intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage("No pudimos cambiar la contraseña. Volvé a solicitar un código e intentá nuevamente.");
        return;
      }
      await supabase.auth.signOut();
      setPassword("");
      setConfirmation("");
      setStep("updated");
    } catch {
      setMessage("No pudimos cambiar la contraseña. Volvé a solicitar un código e intentá nuevamente.");
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
        <h1>{step === "updated" ? "Contraseña actualizada" : step === "password" ? "Elegir contraseña nueva" : step === "code" ? "Ingresar código de recuperación" : "Recuperar contraseña"}</h1>

        {step === "request" && (
          <>
            <p className="muted">Ingresá el correo de tu cuenta. Te enviaremos un código para que lo escribas acá, sin depender de abrir enlaces de un solo uso.</p>
            <form onSubmit={requestCode} className="form-stack">
              <label>Correo electrónico
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
              </label>
              {message && <p className="message error-message" role="alert">{message}</p>}
              <button className="button primary full" disabled={busy}>{busy ? "Enviando..." : "Enviar código de recuperación"}</button>
            </form>
          </>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode} className="form-stack">
            <p className="muted">Ingresá el código que llegó a <strong>{email}</strong>. Usá el código del correo más reciente.</p>
            <label>Código de recuperación
              <input type="text" value={token} onChange={(event) => setToken(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required maxLength={12} />
            </label>
            {message && <p className="message error-message" role="alert">{message}</p>}
            <button className="button primary full" disabled={busy}>{busy ? "Verificando..." : "Validar código"}</button>
            <button type="button" className="button ghost full" disabled={busy} onClick={() => { setStep("request"); setToken(""); setMessage(""); }}>Solicitar otro código</button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={updatePassword} className="form-stack">
            <p className="muted">El código fue validado. Elegí una contraseña nueva de al menos 8 caracteres.</p>
            <label>Nueva contraseña
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete="new-password" />
            </label>
            <label>Repetir nueva contraseña
              <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required autoComplete="new-password" />
            </label>
            {message && <p className="message error-message" role="alert">{message}</p>}
            <button className="button primary full" disabled={busy}>{busy ? "Guardando..." : "Guardar nueva contraseña"}</button>
          </form>
        )}

        {step === "updated" && (
          <div className="form-stack">
            <p className="message success-message">La contraseña fue actualizada. Ya podés ingresar con tu nueva contraseña.</p>
            <Link className="button primary full" href="/login?perfil=administrador&recuperada=1">Ingresar</Link>
          </div>
        )}

        <p className="muted small-text">Para evitar que el enlace caduque al abrirse automáticamente, el correo de recuperación debe mostrar un código de un solo uso.</p>
      </section>
    </main>
  );
}
