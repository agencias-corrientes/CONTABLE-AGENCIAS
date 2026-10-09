"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const rawProfile = searchParams.get("perfil");
  const profile = rawProfile === "administrador" || rawProfile === "empleado" ? rawProfile : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "login") {
      if (!profile) {
        setMessage("Primero seleccioná si vas a ingresar como administrador o empleado.");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        setMessage("No se pudo iniciar sesión. Revisá el correo y la contraseña.");
        setLoading(false);
        return;
      }

      const { data: member, error: memberError } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (memberError || !member) {
        await supabase.auth.signOut();
        setMessage("Esta cuenta todavía no está vinculada a una agencia. Contactá al titular para que te habilite el acceso.");
        setLoading(false);
        return;
      }

      const actualProfile = member.role === "owner" || member.role === "admin" ? "administrador" : "empleado";
      if (actualProfile !== profile) {
        await supabase.auth.signOut();
        setMessage(profile === "administrador"
          ? "Esta cuenta no tiene un perfil de administrador. Elegí Empleado o solicitá al titular que revise tus permisos."
          : "Esta cuenta pertenece al perfil de administrador. Volvé atrás y elegí Administrador.");
        setLoading(false);
        return;
      }

      router.push("/pagos");
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/setup");
      router.refresh();
      return;
    }

    setMode("login");
    setMessage("Cuenta creada. Revisá tu correo para confirmar el acceso antes de ingresar.");
    setLoading(false);
  }

  if (mode === "login" && !profile) {
    return <div className="form-stack login-role-selector">
      <p className="muted">Antes de ingresar, elegí tu perfil.</p>
      <Link className="landing-role-choice landing-role-admin" href="/login?perfil=administrador"><strong>Administrador</strong><small>Titular y configuración de la agencia</small></Link>
      <Link className="landing-role-choice landing-role-employee" href="/login?perfil=empleado"><strong>Empleado</strong><small>Ingreso con permisos asignados</small></Link>
      <Link className="switch-button" href="/login?mode=signup">¿Todavía no tenés usuario? Crear cuenta</Link>
    </div>;
  }

  return (
    <form onSubmit={submit} className="form-stack">
      {mode === "signup" && <label>Nombre completo<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>}
      {mode === "login" && <div className="login-selected-profile"><span className="user-role-pill">{profile === "administrador" ? "Administrador" : "Empleado"}</span><Link href="/login">Cambiar perfil</Link></div>}
      <label>Correo electrónico<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" /></label>
      <label>Contraseña<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
      {message && <div className="message error-message" role="alert">{message}</div>}
      <button className="button primary full" disabled={loading}>{loading ? "Procesando..." : mode === "login" ? "Ingresar" : "Crear cuenta"}</button>
      <button type="button" className="switch-button" onClick={() => { setMessage(""); setMode(mode === "login" ? "signup" : "login"); }}>
        {mode === "login" ? "¿Todavía no tenés usuario? Crear cuenta" : "Ya tengo usuario"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="back-link">← Volver</Link>
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">AGENCIAS CORRIENTES</p>
        <h1>Acceso</h1>
        <p className="muted">Ingresá con el perfil que te corresponde. El sistema verifica el rol asignado a tu cuenta.</p>
        <Suspense fallback={<div className="empty-state">Cargando acceso…</div>}><LoginForm /></Suspense>
      </div>
    </main>
  );
}
