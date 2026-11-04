import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LandingSplash } from "@/components/landing-splash";
import { SignOutButton } from "@/components/sign-out-button";
import { ApplicationExitButton } from "@/components/application-exit-button";
import { ApplicationInstallButton } from "@/components/application-install-button";

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
            <div className="brand-logo-wrap brand-logo-top-left"><Image src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png" alt="Agencias Corrientes — Quiniela Oficial" width={100} height={100} priority /></div>
            <p className="eyebrow">ACCESO EXCLUSIVO · ADMINISTRADOR MAESTRO</p>
            <h1>Administración Central</h1>
            <p className="lead">Administrá solicitudes de alta, autorización de agencias y estado de las cuentas sin entrar al panel operativo de un agenciero.</p>
            <div className="landing-actions landing-central-actions">
              <Link className="button primary full" href="/plataforma/accesos">Administración Central</Link>
              {member?.organization_id && <Link className="button ghost full" href="/inicio">Ingresar a mi agencia</Link>}
              <SignOutButton className="button ghost full" />
            </div>
            <p className="muted small-text">El panel central vuelve a verificar tu autorización en el servidor. Las cuentas de agencia no pueden abrirlo por su cuenta.</p>
          </section>
        </main>
      );
    }
    redirect("/inicio");
  }

  return (
    <main className="landing landing-login">
      <LandingSplash />
      <section className="landing-card landing-role-card">
        <div className="brand-logo-wrap login-entry-logo"><Image src="/Esfera_brillante_de_Agencias_Corrientes-removebg-preview.png" alt="Agencias Corrientes — Quiniela Oficial" width={84} height={84} priority /></div>
        <h1>Control de Agencias</h1>
        <div className="landing-role-grid">
          <Link className="landing-role-choice landing-role-admin" href="/login?perfil=administrador">
            <span className="landing-role-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01" /></svg></span>
            <span className="landing-role-copy"><strong>Agenciero</strong><span className="landing-role-action">Ingresar</span></span>
          </Link>
          <Link className="landing-role-choice landing-role-employee" href="/login?perfil=empleado">
            <span className="landing-role-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M18 4h3v4h-3" /></svg></span>
            <span className="landing-role-copy"><strong>Empleado</strong><span className="landing-role-action">Ingresar</span></span>
          </Link>
        </div>
        <ApplicationInstallButton />
        <ApplicationExitButton />
        <div className="login-create-account"><Link href="/registro">Crear cuenta de titular</Link></div>
      </section>
    </main>
  );
}
