import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;

  if (claims?.sub) redirect("/dashboard");

  return (
    <main className="landing">
      <section className="landing-card">
        <div className="brand-mark">AC</div>
        <p className="eyebrow">AGENCIAS CORRIENTES</p>
        <h1>Contable Agencias</h1>
        <p className="lead">
          Administración, contabilidad y finanzas en un solo sistema,
          preparado para crecer con la operación diaria de la empresa.
        </p>
        <div className="landing-actions">
          <Link className="button primary" href="/login">Ingresar al sistema</Link>
          <Link className="button ghost" href="/login?mode=signup">Crear usuario</Link>
        </div>
        <div className="feature-strip">
          <span>✓ Contabilidad</span>
          <span>✓ Caja y bancos</span>
          <span>✓ Ventas y compras</span>
          <span>✓ Reportes</span>
        </div>
      </section>
    </main>
  );
}
