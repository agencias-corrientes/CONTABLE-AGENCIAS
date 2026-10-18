"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setAccountExists(false);
    if (password.length < 8 || password !== confirmation) {
      setMessage(password.length < 8 ? "La contraseña debe tener al menos 8 caracteres." : "Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    // El enlace de confirmación vuelve al mismo entorno desde el que se creó la cuenta.
    // La URL de Preview correspondiente debe estar autorizada en Authentication → URL Configuration.
    const emailRedirectTo = new URL("/auth/callback", window.location.origin).toString();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), registration_type: "agency_owner" }, emailRedirectTo },
    });
    if (error) {
      const detail = error.message.toLowerCase();
      const status = (error as { status?: number }).status;
      const code = (error as { code?: string }).code?.toLowerCase() ?? "";
      if (
        /already registered|user already exists|already been registered|email.*already exists/.test(detail) ||
        ["user_already_exists", "email_exists"].includes(code)
      ) {
        setAccountExists(true);
        setMessage("Ese correo ya tiene una cuenta. No hace falta crear otra: ingresá como titular o recuperá la contraseña si no la recordás.");
      } else if (detail.includes("redirect") || detail.includes("allow list")) {
        setMessage("Supabase rechazó la URL de confirmación de este Preview. Hay que autorizar esta URL en Authentication → URL Configuration del proyecto Preview.");
      } else if (status === 429 || detail.includes("rate limit") || detail.includes("too many requests")) {
        setMessage("Se alcanzó el límite de intentos de registro. No vuelvas a enviar el formulario repetidamente; esperá y probá una sola vez más tarde.");
      } else if (detail.includes("signup is disabled") || detail.includes("signups not allowed") || detail.includes("sign up is disabled")) {
        setMessage("El servicio de autenticación tiene deshabilitada la creación de cuentas. Hay que revisar la configuración de registros del proyecto Preview.");
      } else if (detail.includes("invalid email") || detail.includes("email address is invalid")) {
        setMessage("El correo no tiene un formato válido. Revisalo y volvé a intentarlo.");
      } else if (detail.includes("password") && (detail.includes("weak") || detail.includes("short") || detail.includes("characters") || detail.includes("length"))) {
        setMessage("La contraseña no cumple los requisitos del servicio. Usá una contraseña más segura de al menos 8 caracteres.");
      } else if (detail.includes("database error saving new user")) {
        setMessage("El servicio de autenticación no pudo guardar la cuenta. No repitas el alta varias veces; hay que revisar el error interno antes de volver a intentarlo.");
      } else {
        setMessage("No se pudo crear la cuenta por un error de autenticación" + (code || status ? " (código: " + (code || status) + ")" : "") + ". Verificá el correo y la conexión; si persiste, compartí este mensaje.");
      }
      setLoading(false);
      return;
    }

    // Supabase intentionally returns an empty identities array for an already-registered email.
    // In this case no new confirmation email is sent; guide the user to sign in instead.
    if (data.user && !data.session && (data.user.identities?.length ?? 0) === 0) {
      setAccountExists(true);
      setMessage("Ese correo ya tiene una cuenta. No se envió otro correo de alta; ingresá con esa cuenta para continuar.");
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/setup");
      router.refresh();
      return;
    }
    setWaiting(true);
    setMessage("Te enviamos un correo de confirmación. Después de confirmar la dirección, el administrador maestro debe aprobar el alta antes de que puedas crear la agencia.");
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="back-link">← Volver</Link>
        <div className="brand-mark small brand-logo-wrap"><img src="/logo-agencias-quiniela.svg" alt="Agencias Corrientes" width="88" height="88" /></div>
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
                {accountExists && <> <Link href="/login?perfil=administrador">Ingresar como titular</Link> o <Link href="/recuperar-clave">recuperar la contraseña</Link>.</>}
              </div>
            )}
            <button className="button primary full" disabled={loading}>{loading ? "Creando cuenta..." : "Crear cuenta y continuar"}</button>
          </form>
        ) : <div className="message" role="status">{message}</div>}
        <p className="muted small-text">¿Ya tenés cuenta? <Link href="/login">Ingresar</Link></p>
      </div>
    </main>
  );
}
