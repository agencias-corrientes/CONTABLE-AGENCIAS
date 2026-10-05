import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";

export default async function ConfiguracionPage() {
  const { organization } = await getCurrentContext();
  return <div className="page">
    <div className="topbar">
      <div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Configuración</h1><p className="muted">Datos y accesos de {organization?.name || "la agencia"}.</p></div>
    </div>
    <div className="settings-grid">
      <Link href="/configuracion/organizacion" className="settings-card"><strong>Agencia oficial</strong><span>Nombre, razón social, identificación y datos generales.</span></Link>
      <Link href="/configuracion/usuarios" className="settings-card"><strong>Usuarios y roles</strong><span>Quién puede administrar la agencia y registrar rendiciones.</span></Link>
    </div>
  </div>;
}
