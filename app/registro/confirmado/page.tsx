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
        <h1 id="confirmed-title">¡Correo confirmado!</h1>
        <div className="message success-message" role="status">
          Tu correo electrónico se confirmó correctamente y tu cuenta quedó activada.
        </div>
        <p className="muted">
          Para empezar a usar el sistema, continuá con la configuración de tu agencia.
        </p>
        <div className="form-stack">
          <Link className="button primary full" href="/setup">
            Continuar y configurar mi agencia
          </Link>
          <Link className="button ghost full" href="/login?perfil=administrador">
            Ir al inicio de sesión
          </Link>
        </div>
      </section>
    </main>
  );
}
