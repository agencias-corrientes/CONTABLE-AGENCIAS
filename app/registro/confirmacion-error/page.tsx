import Link from "next/link";
import Image from "next/image";

export default function RegistrationConfirmationErrorPage() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="confirmation-error-title">
        <div className="brand-mark small brand-logo-wrap">
          <Image
            src="/logo-agencias-quiniela.svg"
            alt="Agencias de Quiniela Corrientes"
            width={44}
            height={44}
            priority
          />
        </div>
        <p className="eyebrow">AGENCIAS CORRIENTES</p>
        <h1 id="confirmation-error-title">No pudimos confirmar el correo</h1>
        <div className="message" role="status">
          El enlace puede haber vencido o ya haber sido utilizado. Volvé a abrir el último correo de confirmación. Si ya habías confirmado tu cuenta, podés intentar ingresar.
        </div>
        <div className="form-stack">
          <Link className="button primary full" href="/registro">
            Volver al registro
          </Link>
          <Link className="button ghost full" href="/login?perfil=administrador">
            Ingresar como titular
          </Link>
        </div>
      </section>
    </main>
  );
}
