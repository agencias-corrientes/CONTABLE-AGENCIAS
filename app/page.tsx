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
        <p className="lead">Seleccioná tu perfil para ingresar al sistema de rendiciones, subagentes y ambulantes.</p>
        <div className="landing-role-grid">
          <Link className="landing-role-choice landing-role-admin" href="/login?perfil=administrador">
            <span className="landing-role-icon">♙</span>
            <strong>Administrador</strong>
            <small>Acceso del titular y configuración de la agencia</small>
            <span className="landing-role-enter">Ingresar como administrador →</span>
          </Link>
          <Link className="landing-role-choice landing-role-employee" href="/login?perfil=empleado">
            <span className="landing-role-icon">♟</span>
            <strong>Empleado</strong>
            <small>Acceso según los permisos asignados por el titular</small>
            <span className="landing-role-enter">Ingresar como empleado →</span>
          </Link>
        </div>
        <div className="landing-actions"><Link className="button ghost" href="/login?mode=signup">Crear usuario</Link></div>
        <div className="feature-strip"><span>✓ Rendiciones diarias</span><span>✓ Subagentes</span><span>✓ Ambulantes</span><span>✓ Cobranzas en Caja</span></div>
      </section>
    </main>
  );
}
