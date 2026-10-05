import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";
export default async function ConfiguracionPage() {
  const { organization } = await getCurrentContext();
  return <div className="page"><div className="topbar"><div><p className="eyebrow">SISTEMA</p><h1>Configuración</h1><p className="muted">Parámetros de {organization?.name || "la empresa"}.</p></div></div><div className="settings-grid"><Link href="/configuracion/organizacion" className="settings-card"><strong>Empresa</strong><span>Datos generales y fiscales.</span></Link><div className="settings-card disabled"><strong>Usuarios y roles</strong><span>Gestión de accesos.</span></div><div className="settings-card disabled"><strong>Períodos fiscales</strong><span>Apertura, cierre y reapertura.</span></div></div></div>;
}
