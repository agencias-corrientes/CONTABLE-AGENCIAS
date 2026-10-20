import Link from "next/link";
import Image from "next/image";
import { EmailConfirmationAction } from "@/components/email-confirmation-action";

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = String(params.token_hash ?? "");
  const rawType = String(params.type ?? "");
  const type = rawType === "signup" || rawType === "email" ? rawType : null;
  const valid = tokenHash.length > 0 && type !== null;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="email-confirmation-title">
        <Link href="/login?perfil=administrador" className="back-link">← Volver al ingreso</Link>
        <div className="brand-logo-wrap brand-logo-top-left auth-page-logo">
          <Image src="/logo-agencias-corrientes.webp" alt="Agencias Corrientes — Quiniela Oficial" width={76} height={76} priority />
        </div>
        <p className="eyebrow">AGENCIAS CORRIENTES</p>
        <h1 id="email-confirmation-title">Confirmar correo electrónico</h1>
        {valid ? (
          <EmailConfirmationAction tokenHash={tokenHash} type={type} />
        ) : (
          <div className="form-stack">
            <p className="message error-message">El enlace de confirmación no tiene los datos necesarios. Pedí un correo nuevo desde el registro.</p>
            <Link className="button primary full" href="/registro">Volver al registro</Link>
          </div>
        )}
      </section>
    </main>
  );
}
