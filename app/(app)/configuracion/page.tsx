import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";

export default async function ConfiguracionPage() {
  const { organization } = await getCurrentContext();
  return <div className="page"><div className="topbar"><div><p className="eyebrow">SISTEMA</p><h1>Configuración</h1><p className="muted">Parámetros de {organization?.name || "la empresa"}.</p></div></div>
    <div className="settings-grid">
      <Link href="/configuracion/organizacion" className="settings-card"><strong>Empresa</strong><span>Datos generales y fiscales.</span></Link>
      <Link href="/configuracion/usuarios" className="settings-card"><strong>Usuarios y roles</strong><span>Accesos, permisos y perfiles.</span></Link>
      <Link href="/configuracion/periodos" className="settings-card"><strong>Períodos fiscales</strong><span>Apertura y control de ejercicios.</span></Link>
    </div>
  </div>;
}
