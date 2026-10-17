"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetNewPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSessionReady(Boolean(data.session));
        setCheckingSession(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSessionReady(Boolean(session));
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
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

    setLoading(true);
    const supabase = createClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      setSessionReady(false);
      setMessage("El enlace venció o ya se utilizó. Solicitá otro enlace de recuperación.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage("No se pudo cambiar la contraseña. Solicitá un enlace nuevo e intentá nuevamente.");
      setLoading(false);
      return;
    }

    // The recovery session is valid. Continue with the existing account:
    // /setup sends unlinked owners to create their agency, while linked users go to /pagos.
    router.replace("/setup");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/login?perfil=administrador" className="back-link">← Volver al ingreso</Link>
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">RECUPERAR ACCESO</p>
        <h1>Elegir contraseña nueva</h1>
        {checkingSession ? (
          <p className="muted">Verificando el enlace de recuperación…</p>
        ) : !sessionReady ? (
          <div className="message error-message" role="alert">
            El enlace no está activo o ya venció. <Link href="/recuperar">Solicitar otro enlace</Link>.
          </div>
        ) : (
          <form onSubmit={submit} className="form-stack">
            <label>Nueva contraseña
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
            </label>
            <label>Repetir contraseña
              <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} autoComplete="new-password" />
            </label>
            {message && <div className="message error-message" role="alert">{message}</div>}
            <button className="button primary full" disabled={loading}>{loading ? "Guardando..." : "Guardar contraseña y continuar"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
