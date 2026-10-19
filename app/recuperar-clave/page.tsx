"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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

  const normalizedEmail = email.trim().toLowerCase();

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      // The recovery email template must expose only {{ .Token }} and must not
      // include {{ .ConfirmationURL }}, whose GET can be consumed by mail scanners.
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);

      if (error) {
        const details = error.message.toLowerCase();
        const status = (error as { status?: number }).status;
        if (status === 429 || details.includes("rate limit") || details.includes("too many requests")) {
          setMessage("Se alcanzó el límite de correos de recuperación. No vuelvas a solicitarlo repetidamente; esperá a que se habilite y pedí un solo código.");
        } else {
          setMessage("No pudimos enviar el código. Revisá el correo e intentá nuevamente más tarde.");
        }
        return;
      }

      setStep("code");
      setMessage("Si la cuenta existe, llegará un código de recuperación. Copiá el código en esta pantalla; no abras el enlace del correo.");
    } catch {
      setMessage("No pudimos conectar con el servicio de autenticación. Intentá nuevamente más tarde.");
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
        email: normalizedEmail,
        token: token.trim().replace(/\s/g, ""),
        type: "recovery",
      });

      if (error) {
        setMessage("El código no es válido, venció o ya fue utilizado. Usá el código del correo más reciente y no abras enlaces de recuperación.");
        return;
      }

      setStep("password");
      setToken("");
      setMessage("Código validado. Ahora elegí la contraseña nueva.");
    } catch {
      setMessage("No pudimos validar el código. Revisá que corresponda al correo más reciente.");
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
        setMessage("No pudimos actualizar la contraseña. Volvé a validar un código de recuperación nuevo.");
        return;
      }
      await supabase.auth.signOut();
      setPassword("");
      setConfirmation("");
      setStep("updated");
      setMessage("");
    } catch {
      setMessage("No pudimos actualizar la contraseña. Volvé a validar un código de recuperación nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/login?perfil=administrador" className="back-link">← Volver al ingreso</Link>
        <div className="brand-logo-wrap brand-logo-top-left auth-page-logo"><Image src="/icon" alt="Agencias Corrientes — Quiniela Oficial" width={76} height={76} priority /></div>
        <p className="eyebrow">RECUPERACIÓN DE ACCESO</p>
        <h1>{step === "updated" ? "Contraseña actualizada" : step === "password" ? "Elegir contraseña nueva" : step === "code" ? "Ingresar código de recuperación" : "Recuperar contraseña"}</h1>

        {step === "request" && (
          <>
            <p className="muted">Ingresá el correo de tu cuenta. Te enviaremos un código de un solo uso. No hace falta crear otra cuenta.</p>
            <form onSubmit={requestCode} className="form-stack">
              <label>Correo electrónico
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
              </label>
              {message && <p className="message error-message" role="alert">{message}</p>}
              <button className="button primary full" disabled={busy}>{busy ? "Enviando..." : "Enviar código de recuperación"}</button>
            </form>
          </>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode} className="form-stack">
            <p className="muted">Ingresá el código que llegó a <strong>{normalizedEmail}</strong>. Usá el código del correo más reciente y no abras el enlace de recuperación.</p>
            <label>Código de recuperación
              <input type="text" value={token} onChange={(event) => setToken(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required maxLength={12} />
            </label>
            {message && <p className="message error-message" role="alert">{message}</p>}
            <button className="button primary full" disabled={busy}>{busy ? "Verificando..." : "Validar código"}</button>
            <button type="button" className="button ghost full" disabled={busy} onClick={() => { setStep("request"); setToken(""); setMessage(""); }}>Volver</button>
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
            <p className="message success-message">La contraseña fue actualizada. Ya podés ingresar con ella.</p>
            <Link className="button primary full" href="/login?perfil=administrador&recuperada=1">Ingresar</Link>
          </div>
        )}
        {step === "request" && message && <p className="message error-message" role="alert">{message}</p>}
      </section>
    </main>
  );
}
