"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      setMessage("Primero elegí Agenciero o Empleado.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      const authMessage = String(error?.message ?? "").toLowerCase();
      if (authMessage.includes("email not confirmed") || authMessage.includes("email_not_confirmed") || authMessage.includes("email address not confirmed")) {
        setMessage("El correo todavía no está confirmado. Abrí el último mensaje de confirmación y completá ese paso antes de ingresar.");
      } else {
        setMessage("No se pudo iniciar sesión. Revisá el correo y la contraseña.");
      }
      setLoading(false);
      return;
    }

    const rpcClient = supabase as any;
    const [
      { data: platformAdminData, error: platformAdminError },
      { data: accessStatusData, error: accessStatusError },
    ] = await Promise.all([
      rpcClient.rpc("is_platform_admin"),
      rpcClient.rpc("get_platform_access_status"),
    ]);
    if (platformAdminError || accessStatusError) {
      await supabase.auth.signOut();
      setMessage("No pudimos comprobar la autorización central de esta cuenta. No se inició la sesión; volvé a intentarlo más tarde.");
      setLoading(false);
      return;
    }
    const isPlatformAdmin = platformAdminData === true;
    const accessStatus = typeof accessStatusData === "string" ? accessStatusData : "not_requested";

    if (["rejected", "suspended", "revoked"].includes(accessStatus)) {
      router.push("/acceso-bloqueado");
      router.refresh();
      return;
    }
    if (accessStatus === "pending" && !isPlatformAdmin) {
      router.push("/acceso-pendiente");
      router.refresh();
      return;
    }
    if (isPlatformAdmin && profile === "administrador") {
      router.push("/");
      router.refresh();
      return;
    }

    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", data.user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memberError) {
      await supabase.auth.signOut();
      setMessage("No pudimos verificar la agencia de esta cuenta. Volvé a intentarlo y, si persiste, contactá al soporte.");
      setLoading(false);
      return;
    }

    if (!member) {
      if (profile === "administrador") {
        router.push(accessStatus === "approved" ? "/setup" : "/acceso-pendiente");
        router.refresh();
        return;
      }
      await supabase.auth.signOut();
      setMessage("Esta cuenta todavía no está vinculada a una agencia. Pedile al titular que te habilite el acceso.");
      setLoading(false);
      return;
    }

    const actualProfile = member.role === "owner" || member.role === "admin" ? "administrador" : "empleado";
    if (actualProfile !== profile) {
      await supabase.auth.signOut();
      setMessage(profile === "administrador"
        ? "Esta cuenta no tiene perfil de administrador. Elegí Empleado o solicitá al titular que revise tu acceso."
        : "Esta cuenta pertenece al perfil de administrador. Volvé atrás y elegí Agenciero.");
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
          <span className="landing-role-copy"><strong>Agenciero</strong><small>Acceso del titular y configuración de la agencia</small></span>
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
        <span className="user-role-pill">{profile === "administrador" ? "Agenciero" : "Empleado"}</span>
        <Link href="/login">Cambiar perfil</Link>
      </div>
      {searchParams.get("confirmado") === "1" && <p className="message success-message">Correo confirmado. Ingresá con el correo del empleado y la contraseña inicial que le asignó el titular.</p>}
      {searchParams.get("confirmacion") === "error" && <p className="message error-message">No pudimos completar la confirmación en este entorno. Volvé a abrir el último correo que recibiste y verificá que corresponda al mismo Preview donde se creó la cuenta.</p>}
      <label>Correo electrónico
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
      </label>
      <label>Contraseña
        <span style={{ position: "relative", display: "block" }}>
          <input type={showPassword ? "text" : "password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" style={{ paddingRight: "3.25rem" }} />
          <button
            type="button"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={showPassword}
            title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShowPassword((visible) => !visible)}
            style={{ position: "absolute", right: "0.55rem", top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", justifyContent: "center", width: "2.25rem", height: "2.25rem", padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3l18 18" />
                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.8 5.1 9.5 6.3a1.3 1.3 0 0 1 0 1.4 16 16 0 0 1-3.1 3.6" />
                <path d="M6.2 6.2a16.3 16.3 0 0 0-3.7 5.1 1.3 1.3 0 0 0 0 1.4C3.2 13.9 6.8 19 12 19a10.6 10.6 0 0 0 3.1-.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            )}
          </button>
        </span>
      </label>
      {message && <div className="message error-message" role="alert">{message}</div>}
      <button className="button primary full" disabled={loading}>{loading ? "Ingresando..." : "Ingresar"}</button>
      {searchParams.get("recuperada") === "1" && (
        <p className="message success-message">Contraseña actualizada. Ya podés ingresar con la nueva contraseña.</p>
      )}
      <p className="muted small-text"><Link href="/recuperar-clave">¿Olvidaste tu contraseña?</Link></p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="back-link">← Volver</Link>
        <div className="brand-logo-wrap brand-logo-top-left login-agency-brand"><Image src="/logo-agencias-corrientes.webp" alt="Agencias Corrientes — Quiniela Oficial" width={88} height={88} priority unoptimized /></div>
        <p className="eyebrow">AGENCIAS CORRIENTES</p>
        <h1>Control de Agencias</h1>
        <p className="muted">Ingresá con una cuenta existente. El sistema verifica el rol asignado por cada agencia.</p>
        <Suspense fallback={<div className="empty-state">Cargando acceso…</div>}><LoginForm /></Suspense>
      </div>
    </main>
  );
}
