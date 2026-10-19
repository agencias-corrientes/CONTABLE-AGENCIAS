import Link from "next/link";
import Image from "next/image";

export default function RegistrationConfirmationErrorPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="confirmation-error-title">
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
        <h1 id="confirmation-error-title">Este enlace ya se usó o venció</h1>
        <div className="message" role="status">
          No vuelvas a crear otra cuenta por este mensaje. Si ya habías confirmado tu correo, tu cuenta sigue registrada: ingresá y Administración Central podrá aprobar tu solicitud. Si todavía no lo confirmaste, revisá el correo más reciente de confirmación.
        </div>
        <p className="muted">
          La aprobación de Administración Central se realiza después de confirmar el correo. No necesitás iniciar una recuperación de contraseña solo por haber visto este aviso.
        </p>
        <div className="form-stack">
          <Link className="button primary full" href="/login?perfil=administrador">
            Ingresar como titular
          </Link>
          <Link className="button ghost full" href="/registro">
            Volver al registro
          </Link>
        </div>
      </section>
    </main>
  );
}
