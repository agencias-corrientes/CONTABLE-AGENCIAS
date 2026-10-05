import { getCurrentContext, money } from "@/lib/accounting";

export default async function PagosPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const { data: payments } = await supabase.from("payments").select("id,payment_date,direction,amount,reference,contacts(display_name),cash_accounts(name)").eq("organization_id", organization.id).order("payment_date", { ascending: false }).limit(100);

  return (
    <div className="page">
      <div className="topbar"><div><p className="eyebrow">TESORERÍA</p><h1>Pagos</h1><p className="muted">Cobros y pagos asociados a caja, bancos y comprobantes.</p></div><button className="button primary">Nuevo pago</button></div>
      <section className="panel table-panel"><div className="panel-head"><h2>Últimos movimientos</h2><span className="muted">{payments?.length ?? 0} registros</span></div>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Contacto</th><th>Cuenta</th><th>Dirección</th><th>Importe</th></tr></thead><tbody>{(payments ?? []).map((row) => { const contact=Array.isArray(row.contacts)?row.contacts[0]:row.contacts; const account=Array.isArray(row.cash_accounts)?row.cash_accounts[0]:row.cash_accounts; return <tr key={row.id}><td>{row.payment_date}</td><td>{contact?.display_name||"—"}</td><td>{account?.name||"—"}</td><td>{row.direction==="incoming"?"Cobro":"Pago"}</td><td className="mono">{money(row.amount, organization.currency_code)}</td></tr>; })}</tbody></table></div></section>
    </div>
  );
}
