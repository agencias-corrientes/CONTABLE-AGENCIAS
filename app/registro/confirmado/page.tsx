import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export default async function RegistrationConfirmedPage() {
  let requestSaved = false;
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getClaims();
    if (authData?.claims?.sub) {
      const { data, error } = await (supabase as any).rpc("submit_platform_access_request");
      requestSaved = !error && ["pending", "approved", "member"].includes(String(data));
    }
  } catch {
    requestSaved = false;
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="confirmed-title">
        <div className="brand-logo-wrap brand-logo-top-left auth-page-logo">
          <Image
            src="/logo-agencias-corrientes.webp"
            alt="Agencias de Quiniela Corrientes"
            width={44}
            height={44}
            priority
          />
        </div>
        <p className="eyebrow">AGENCIAS CORRIENTES</p>
        <h1 id="confirmed-title">¡Ya estás registrado!</h1>
        <div className="message success-message" role="status">
          Tu correo electrónico quedó confirmado. {requestSaved
            ? "La solicitud ya está registrada y aparece en Administración Central para que el administrador maestro pueda aprobarla o rechazarla."
            : "Iniciá sesión con este mismo correo para registrar la solicitud de aprobación en Administración Central."}
        </div>
        <p className="muted">
          No necesitás volver a registrarte ni abrir otro enlace. La agencia solo podrá configurarse después de que Administración Central apruebe el alta.
        </p>
        <div className="form-stack">
          <Link className="button primary full" href="/login?perfil=administrador">
            Ir al inicio de sesión
          </Link>
        </div>
      </section>
    </main>
  );
}
