"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const rawProfile = searchParams.get("perfil");
  const profile = rawProfile === "administrador" || rawProfile === "empleado" ? rawProfile : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();

    if (!profile) {
      setMessage("Primero elegí Administrador o Empleado.");
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
      setMessage("Esta cuenta todavía no está vinculada a una agencia. Si sos titular y estás empezando, usá “Crear cuenta de propietario”; si sos empleado, pedile al titular que te habilite.");
      setLoading(false);
      return;
    }

    const actualProfile = member.role === "owner" || member.role === "admin" ? "administrador" : "empleado";
    if (actualProfile !== profile) {
      await supabase.auth.signOut();
      setMessage(profile === "administrador"
        ? "Esta cuenta no tiene perfil de administrador. Elegí Empleado o solicitá al titular que revise tu acceso."
        : "Esta cuenta pertenece al perfil de administrador. Volvé atrás y elegí Administrador.");
      setLoading(false);
      return;
    }

    router.push("/pagos");
    router.refresh();
  }

  if (!profile) {
    return (
      <div className="form-stack login-role-selector">
        <p className="muted">Seleccioná el perfil de tu cuenta existente.</p>
        <Link className="landing-role-choice landing-role-admin" href="/login?perfil=administrador">
          <span className="landing-role-copy"><strong>Administrador</strong><small>Acceso del titular y configuración de la agencia</small></span>
          <span className="landing-role-enter">Ingresar →</span>
        </Link>
        <Link className="landing-role-choice landing-role-employee" href="/login?perfil=empleado">
          <span className="landing-role-copy"><strong>Empleado</strong><small>Acceso según los permisos asignados</small></span>
          <span className="landing-role-enter">Ingresar →</span>
        </Link>
        <p className="muted small-text">¿Sos titular y todavía no tenés cuenta? <Link href="/registro">Crear cuenta de propietario</Link></p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <div className="login-selected-profile">
        <span className="user-role-pill">{profile === "administrador" ? "Administrador" : "Empleado"}</span>
        <Link href="/login">Cambiar perfil</Link>
      </div>
      <label>Correo electrónico
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
      </label>
      <label>Contraseña
        <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
      </label>
      {message && <div className="message error-message" role="alert">{message}</div>}
      <button className="button primary full" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</button>
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
        <h1>Control de Agencias</h1>
        <p className="muted">Ingresá con una cuenta existente. El sistema verifica el rol asignado por cada agencia.</p>
        <Suspense fallback={<div className="empty-state">Cargando acceso…</div>}><LoginForm /></Suspense>
      </div>
    </main>
  );
}
