import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingSplash } from "@/components/landing-splash";
import { SignOutButton } from "@/components/sign-out-button";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (authData?.claims?.sub) {
    const { data: isPlatformAdmin, error: adminError } = await (supabase as any).rpc("is_platform_admin");
    if (!adminError && isPlatformAdmin === true) {
      const userId = String(authData.claims.sub);
      const { data: member } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      return (
        <main className="landing">
          <section className="landing-card landing-role-card">
            <div className="brand-logo-wrap brand-logo-top-left"><Image src="/logo-agencias-corrientes.webp" alt="Agencias Corrientes — Quiniela Oficial" width={100} height={100} priority /></div>
            <p className="eyebrow">ACCESO EXCLUSIVO · ADMINISTRADOR MAESTRO</p>
            <h1>Administración Central</h1>
            <p className="lead">Administrá solicitudes de alta, autorización de agencias y estado de las cuentas sin entrar al panel operativo de un agenciero.</p>
            <div className="landing-actions landing-central-actions">
              <Link className="button primary full" href="/plataforma/accesos">Administración Central</Link>
              {member?.organization_id && <Link className="button ghost full" href="/pagos">Ingresar a mi agencia</Link>}
              <SignOutButton className="button ghost full" />
            </div>
            <p className="muted small-text">El panel central vuelve a verificar tu autorización en el servidor. Las cuentas de agencia no pueden abrirlo por su cuenta.</p>
          </section>
        </main>
      );
    }
    redirect("/pagos");
  }

  return (
    <main className="landing">
      <LandingSplash />
      <section className="landing-card landing-role-card landing-access-card">
        <header className="landing-brand-header">
          <div className="brand-logo-wrap landing-agency-brand"><Image src="/logo-agencias-corrientes.webp" alt="Agencias Corrientes — Quiniela Oficial" width={104} height={104} priority /></div>
          <div className="landing-brand-copy">
            <p className="eyebrow">AGENCIAS CORRIENTES</p>
            <h1>Control de Agencias</h1>
            <p>Gestión diaria de subagentes y ambulantes, con una agencia independiente para cada titular.</p>
          </div>
        </header>
        <div className="landing-section-divider"><span>ELEGÍ CÓMO INGRESAR</span></div>
        <div className="landing-role-grid">
          <Link className="landing-role-choice landing-role-admin" href="/login?perfil=administrador">
            <span className="landing-role-copy"><strong>Agenciero</strong><small>Ingresar como titular de una agencia ya configurada</small></span>
            <span className="landing-role-enter">Ingresar →</span>
          </Link>
          <Link className="landing-role-choice landing-role-employee" href="/login?perfil=empleado">
            <span className="landing-role-copy"><strong>Empleado</strong><small>Operaciones habilitadas por el titular</small></span>
            <span className="landing-role-enter">Ingresar →</span>
          </Link>
        </div>
        <div className="landing-owner-register">
          <div className="landing-owner-register-copy">
            <span className="landing-form-kicker">¿TODAVÍA NO TENÉS CUENTA?</span>
            <strong>Soy titular: crear cuenta y configurar mi agencia</strong>
            <small>El alta queda pendiente hasta la autorización del administrador maestro.</small>
          </div>
          <Link className="button primary landing-owner-register-button" href="/registro">Crear mi cuenta →</Link>
        </div>
        <div className="feature-strip landing-feature-strip"><span>✓ Rendiciones diarias</span><span>✓ Subagentes</span><span>✓ Ambulantes</span><span>✓ Cobranzas en Caja</span></div>
      </section>
    </main>
  );
}
