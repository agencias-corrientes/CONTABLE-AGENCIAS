import Link from "next/link";
import Image from "next/image";

export default function RegistrationConfirmedPage() {
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
          Tu correo electrónico quedó confirmado y tu solicitud de alta ya está registrada. Ahora Administración Central debe aprobarla para que puedas configurar tu agencia.
        </div>
        <p className="muted">
          No necesitás volver a registrarte ni abrir otro enlace. Cuando el administrador apruebe tu solicitud, ingresá con este correo y tu contraseña para continuar con la configuración.
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
