"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/password-input";

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
        setMessage("Ese correo ya está registrado. No se envió un nuevo correo de alta. Ingresá con la cuenta existente; no hace falta crear otra.");
      } else if (detail.includes("redirect") || detail.includes("allow list")) {
        setMessage("El servicio rechazó la dirección de confirmación. Revisá la URL autorizada en Authentication → URL Configuration.");
      } else if (status === 429 || detail.includes("rate limit") || detail.includes("too many requests")) {
        setMessage("Se alcanzó el límite de intentos de registro. Esperá antes de volver a intentarlo.");
      } else if (detail.includes("signup is disabled") || detail.includes("signups not allowed") || detail.includes("sign up is disabled")) {
        setMessage("La creación de cuentas está deshabilitada en el servicio de autenticación. Hay que revisar su configuración.");
      } else if (detail.includes("invalid email") || detail.includes("email address is invalid")) {
        setMessage("El correo no tiene un formato válido. Revisalo y volvé a intentarlo.");
      } else if (detail.includes("password") && (detail.includes("weak") || detail.includes("short") || detail.includes("characters") || detail.includes("length"))) {
        setMessage("La contraseña no cumple los requisitos del servicio. Usá una contraseña más segura de al menos 8 caracteres.");
      } else if (detail.includes("database error saving new user")) {
        setMessage("El servicio de autenticación no pudo guardar la cuenta. No repitas el alta; hay que revisar el error interno.");
      } else {
        setMessage("No se pudo crear la cuenta por un error de autenticación" + (code || status ? " (código: " + (code || status) + ")" : "") + ". Verificá el correo y la conexión; si persiste, compartí este mensaje.");
      }
      setLoading(false);
      return;
    }

    if (data.user && !data.session && (data.user.identities?.length ?? 0) === 0) {
      setAccountExists(true);
      setMessage("Ese correo ya está registrado. No se envió un nuevo correo de alta. Ingresá con la cuenta existente; no hace falta crear otra.");
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/setup");
      router.refresh();
      return;
    }
    setWaiting(true);
    setMessage("Te enviamos un correo de confirmación. Después de confirmar la dirección, la solicitud aparecerá en Administración Central para que el administrador maestro apruebe el alta.");
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="back-link">← Volver</Link>
        <div className="brand-logo-wrap brand-logo-top-left auth-page-logo"><Image src="/logo-agencias-corrientes.webp" alt="Agencias Corrientes — Quiniela Oficial" width={76} height={76} priority /></div>
        <p className="eyebrow">ALTA DEL TITULAR</p>
        <h1>Crear cuenta de propietario</h1>
        <p className="muted">Usá el correo que querés emplear para ingresar. Cada titular tendrá su propia agencia, separada de las demás.</p>
        {!waiting ? (
          <form onSubmit={submit} className="form-stack">
            <label>Nombre completo<input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" /></label>
            <label>Correo electrónico de acceso<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
            <label>Crear contraseña<PasswordInput value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" /></label>
            <label>Repetir contraseña<PasswordInput value={confirmation} onChange={setConfirmation} required minLength={8} autoComplete="new-password" /></label>
            {message && (
              <div className={"message " + (accountExists ? "error-message" : "")} role={accountExists ? "alert" : "status"}>
                {message}
                {accountExists && <> <Link href="/login?perfil=administrador">Ingresar como titular</Link>.</>}
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
