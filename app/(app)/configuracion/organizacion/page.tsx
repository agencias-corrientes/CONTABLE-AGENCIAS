import { getCurrentContext } from "@/lib/accounting";
export default async function OrganizacionPage() {
  const { organization } = await getCurrentContext();
  return <div className="page"><div className="topbar"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Empresa</h1><p className="muted">Datos generales de la organización.</p></div></div><section className="panel"><div className="detail-grid"><div><span className="muted">Nombre</span><strong>{organization?.name}</strong></div><div><span className="muted">Razón social</span><strong>{organization?.legal_name || "No definida"}</strong></div><div><span className="muted">CUIT / identificación</span><strong>{organization?.tax_id || "No definido"}</strong></div><div><span className="muted">Moneda</span><strong>{organization?.currency_code || "ARS"}</strong></div><div><span className="muted">Zona horaria</span><strong>{organization?.timezone}</strong></div></div></section></div>;
}
