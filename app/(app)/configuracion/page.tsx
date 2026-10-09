import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/accounting";

export default async function ConfiguracionPage() {
  const { organization, member } = await getCurrentContext();
  if (!organization || !member) redirect("/setup");
  if (member.role !== "owner") redirect("/pagos?error=solo-titular-configuracion");

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">SISTEMA</p>
          <h1>Configuración</h1>
          <p className="muted">Parámetros y accesos para {organization.name || "la agencia"}.</p>
        </div>
        <Link href="/pagos" className="button primary">Volver a rendiciones</Link>
      </div>

      <section className="panel config-shortcuts-panel">
        <div className="panel-head"><div><h2>Administración de la agencia</h2><p className="muted">Entrá directamente al módulo que necesitás configurar.</p></div></div>
        <div className="settings-grid">
          <Link href="/equipo" className="settings-card"><strong>Personal y permisos</strong><span>Crear empleados, ver sus roles y autorizar operaciones.</span></Link>
          <Link href="/agencias" className="settings-card"><strong>Subagentes y ambulantes</strong><span>Administrar agentes y sus excepciones de comisión.</span></Link>
          <Link href="/juegos" className="settings-card"><strong>Juegos y comisiones generales</strong><span>Editar catálogo y los porcentajes base para todos los agentes.</span></Link>
          <Link href="/loteria-correntina" className="settings-card"><strong>Lotería Correntina</strong><span>Consultar extractos y archivos oficiales.</span></Link>
          <Link href="/configuracion/organizacion" className="settings-card"><strong>Datos de la agencia</strong><span>Datos generales y fiscales.</span></Link>
          <Link href="/configuracion/periodos" className="settings-card"><strong>Períodos fiscales</strong><span>Apertura y control de ejercicios.</span></Link>
        </div>
      </section>
    </div>
  );
}
