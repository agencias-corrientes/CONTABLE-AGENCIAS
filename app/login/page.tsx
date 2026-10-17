"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(
    searchParams.get("password") === "updated"
      ? "La contraseña se actualizó correctamente. Ingresá con tu nueva contraseña."
      : ""
  );
  const [loading, setLoading] = useState(false);

  // Some customized Supabase recovery email templates send the user to the Site URL
  // (the login page) instead of honoring resetPasswordForEmail.redirectTo. Handle
  // recovery credentials here as a safe fallback and continue to the new-password form.
  useEffect(() => {
    let active = true;
    let navigatingToRecovery = false;
    const supabase = createClient();

    function openNewPasswordForm() {
      if (!active || navigatingToRecovery) return;
      navigatingToRecovery = true;
      window.history.replaceState({}, document.title, "/login?perfil=administrador");
      router.replace("/recuperar/nueva");
      router.refresh();
    }

    // Supabase can emit PASSWORD_RECOVERY when its client consumes a recovery link,
    // including templates that return to the login URL with a session fragment.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) openNewPasswordForm();
    });

    async function handleRecoveryReturn() {
      const currentUrl = new URL(window.location.href);
      const params = currentUrl.searchParams;
      const fragment = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
      const recoveryType = params.get("type") === "recovery" || fragment.get("type") === "recovery";
      const recoveryFlow = params.get("flow") === "recovery" || recoveryType;
      if (!recoveryFlow) return;

      setLoading(true);
      setMessage("Validando el enlace para cambiar la contraseña…");

      try {
        let sessionReady = false;
        let failureMessage = "";

        const code = params.get("code");
        const tokenHash = params.get("token_hash") || params.get("token");

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          sessionReady = Boolean(data.session) && !error;
          if (error) failureMessage = error.message;
        } else if (tokenHash && recoveryType) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          sessionReady = Boolean(data.session) && !error;
          if (error) failureMessage = error.message;
        } else {
          const accessToken = fragment.get("access_token");
          const refreshToken = fragment.get("refresh_token");
          if (accessToken && refreshToken && recoveryType) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            sessionReady = Boolean(data.session) && !error;
            if (error) failureMessage = error.message;
          } else {
            const { data, error } = await supabase.auth.getSession();
            sessionReady = Boolean(data.session) && !error;
            if (error) failureMessage = error.message;
          }
        }

        if (!active) return;

        if (sessionReady) {
          // Remove one-time credentials from the address bar before navigating.
          openNewPasswordForm();
          return;
        }

        setMessage(
          failureMessage
            ? "El enlace de recuperación venció o ya fue utilizado. Solicitá uno nuevo desde «Olvidé mi contraseña»."
            : "El enlace llegó al inicio de sesión, pero no contiene una autorización activa para cambiar la contraseña. Solicitá un enlace nuevo y abrilo desde el correo más reciente."
        );
        setLoading(false);
      } catch {
        if (!active) return;
        setMessage("No pudimos validar el enlace de recuperación. Solicitá uno nuevo y volvé a abrirlo desde el correo más reciente.");
        setLoading(false);
      }
    }

    void handleRecoveryReturn();
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

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

    if (memberError) {
      await supabase.auth.signOut();
      setMessage("No pudimos verificar la agencia de esta cuenta. Volvé a intentarlo y, si persiste, contactá al soporte.");
      setLoading(false);
      return;
    }

    if (!member) {
      if (profile === "administrador") {
        router.push("/setup");
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
      <p className="muted small-text"><Link href="/recuperar">Olvidé mi contraseña</Link></p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="back-link">← Volver</Link>
        <div className="brand-mark small brand-logo-wrap login-agency-brand"><Image src="/logo-agencias-quiniela.svg" alt="Agencias de Quiniela Corrientes" width={88} height={88} priority /></div>
        <p className="eyebrow">AGENCIAS CORRIENTES</p>
        <h1>Control de Agencias</h1>
        <p className="muted">Ingresá con una cuenta existente. El sistema verifica el rol asignado por cada agencia.</p>
        <Suspense fallback={<div className="empty-state">Cargando acceso…</div>}><LoginForm /></Suspense>
      </div>
    </main>
  );
}
