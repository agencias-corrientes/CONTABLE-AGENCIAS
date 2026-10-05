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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }
      router.push("/dashboard");
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

  return (
    <form onSubmit={submit} className="form-stack">
      {mode === "signup" && (
        <label>
          Nombre completo
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </label>
      )}
      <label>
        Correo electrónico
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label>
        Contraseña
        <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      {message && <div className="message">{message}</div>}
      <button className="button primary full" disabled={loading}>
        {loading ? "Procesando..." : mode === "login" ? "Ingresar" : "Crear cuenta"}
      </button>
      <button
        type="button"
        className="switch-button"
        onClick={() => {
          setMessage("");
          setMode(mode === "login" ? "signup" : "login");
        }}
      >
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
        <p className="eyebrow">AGENCIA OFICIAL</p>
        <h1>Acceso</h1>
        <p className="muted">Ingresá para administrar subagentes, ambulantes, rendiciones y caja.</p>
        <Suspense fallback={<div className="empty-state">Cargando acceso…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
