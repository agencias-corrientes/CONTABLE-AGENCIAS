import { getCurrentContext, money } from "@/lib/accounting";

export default async function ComprasPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const { data: bills } = await supabase
    .from("purchase_bills")
    .select("id,bill_number,issue_date,due_date,status,total_amount,contacts(display_name)")
    .eq("organization_id", organization.id)
    .order("issue_date", { ascending: false })
    .limit(100);

  return (
    <div className="page">
      <div className="topbar"><div><p className="eyebrow">EGRESOS</p><h1>Compras</h1><p className="muted">Comprobantes de proveedores y cuentas por pagar.</p></div><button className="button primary">Nueva compra</button></div>
      <section className="panel table-panel"><div className="panel-head"><h2>Últimos comprobantes</h2><span className="muted">{bills?.length ?? 0} registros</span></div>
      <div className="table-wrap"><table><thead><tr><th>Comprobante</th><th>Fecha</th><th>Proveedor</th><th>Estado</th><th>Total</th></tr></thead><tbody>{(bills ?? []).map((row) => { const contact=Array.isArray(row.contacts)?row.contacts[0]:row.contacts; return <tr key={row.id}><td className="mono">{row.bill_number}</td><td>{row.issue_date}</td><td>{contact?.display_name||"—"}</td><td>{row.status}</td><td className="mono">{money(row.total_amount, organization.currency_code)}</td></tr>; })}</tbody></table></div></section>
    </div>
  );
}
