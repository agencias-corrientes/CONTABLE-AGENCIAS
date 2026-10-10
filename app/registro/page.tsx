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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8 || password !== confirmation) {
      setMessage(password.length < 8 ? "La contraseña debe tener al menos 8 caracteres." : "Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const emailRedirectTo = new URL("/auth/callback?next=%2Fsetup", window.location.origin).toString();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo },
    });
    if (error) {
      setMessage("No se pudo crear la cuenta. Revisá el correo, la conexión y los requisitos de contraseña.");
      setLoading(false);
      return;
    }
    if (data.session) {
      router.push("/setup");
      router.refresh();
      return;
    }
    setWaiting(true);
    setMessage("Te enviamos un correo de confirmación. Abrilo para continuar con la configuración de tu agencia.");
    setLoading(false);
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="back-link">← Volver</Link>
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">ALTA DEL TITULAR</p>
        <h1>Crear cuenta de propietario</h1>
        <p className="muted">Usá el correo que querés emplear para ingresar. Cada titular tendrá su propia agencia, separada de las demás.</p>
        {!waiting ? (
          <form onSubmit={submit} className="form-stack">
            <label>Nombre completo<input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" /></label>
            <label>Correo electrónico de acceso<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
            <label>Crear contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
            <label>Repetir contraseña<input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
            {message && <div className="message error-message" role="alert">{message}</div>}
            <button className="button primary full" disabled={loading}>{loading ? "Creando cuenta..." : "Crear cuenta y continuar"}</button>
          </form>
        ) : <div className="message" role="status">{message}</div>}
        <p className="muted small-text">¿Ya tenés cuenta? <Link href="/login">Ingresar</Link></p>
      </div>
    </main>
  );
}
