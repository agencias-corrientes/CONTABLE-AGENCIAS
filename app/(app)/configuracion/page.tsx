import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";

export default async function ConfiguracionPage() {
  const { organization, member } = await getCurrentContext();
  const isOwner = member?.role === "owner";
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">SISTEMA</p>
          <h1>Configuración</h1>
          <p className="muted">Parámetros y accesos para {organization?.name || "la agencia"}.</p>
        </div>
        <Link href="/dashboard" className="button primary">Panel operativo y acciones rápidas</Link>
      </div>

      <section className="panel config-shortcuts-panel">
        <div className="panel-head">
          <div><h2>Administración de la agencia</h2><p className="muted">Entrá directamente al módulo que necesitás configurar.</p></div>
        </div>
        <div className="settings-grid">
          <Link href="/equipo" className="settings-card"><strong>Personal y permisos</strong><span>Crear empleados, ver sus roles y autorizar operaciones.</span></Link>
          <Link href="/agencias" className="settings-card"><strong>Subagentes y ambulantes</strong><span>Administrar agentes y sus excepciones de comisión.</span></Link>
          <Link href="/juegos" className="settings-card"><strong>Juegos y comisiones generales</strong><span>Editar catálogo y los porcentajes base para todos los agentes.</span></Link>
          <Link href="/loteria-correntina" className="settings-card"><strong>Lotería Correntina</strong><span>Consultar extractos y archivos oficiales.</span></Link>
          <Link href="/pagos" className="settings-card"><strong>Rendiciones</strong><span>Registrar rendiciones, revisar saldos y cargar cobros en Caja.</span></Link>
          <Link href="/configuracion/organizacion" className="settings-card"><strong>Datos de la agencia</strong><span>Datos generales y fiscales.</span></Link>
          <Link href="/configuracion/usuarios" className="settings-card"><strong>Usuarios y roles</strong><span>Revisión de cuentas y perfiles de acceso.</span></Link>
          <Link href="/configuracion/periodos" className="settings-card"><strong>Períodos fiscales</strong><span>Apertura y control de ejercicios.</span></Link>
        </div>
      </section>
      {isOwner && <section className="panel config-admin-note"><h2>Acceso del titular</h2><p className="muted">La configuración sensible, las comisiones generales y la administración del personal están limitadas al titular de la agencia.</p></section>}
    </div>
  );
}
