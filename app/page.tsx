import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (authData?.claims?.sub) redirect("/pagos");

  return (
    <main className="landing">
      <section className="landing-card landing-role-card">
        <div className="brand-mark">AC</div>
        <p className="eyebrow">AGENCIAS CORRIENTES</p>
        <h1>Control de Agencias</h1>
        <p className="lead">Gestión diaria de subagentes y ambulantes, con una agencia independiente para cada titular.</p>
        <div className="landing-role-grid">
          <Link className="landing-role-choice landing-role-admin" href="/login?perfil=administrador">
            <span className="landing-role-copy"><strong>Administrador</strong><small>Ingresar como titular de una agencia ya configurada</small></span>
            <span className="landing-role-enter">Ingresar →</span>
          </Link>
          <Link className="landing-role-choice landing-role-employee" href="/login?perfil=empleado">
            <span className="landing-role-copy"><strong>Empleado</strong><small>Operaciones habilitadas por el titular</small></span>
            <span className="landing-role-enter">Ingresar →</span>
          </Link>
        </div>
        <div className="landing-actions">
          <Link className="button primary full" href="/registro">Soy titular: crear cuenta y configurar mi agencia</Link>
        </div>
        <p className="muted small-text">¿Primera vez? Registrá tu propio correo. No hay usuarios ni contraseñas de demostración.</p>
        <div className="feature-strip"><span>✓ Rendiciones diarias</span><span>✓ Subagentes</span><span>✓ Ambulantes</span><span>✓ Cobranzas en Caja</span></div>
      </section>
    </main>
  );
}
