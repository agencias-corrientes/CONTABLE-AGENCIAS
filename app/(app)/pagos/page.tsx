import { getCurrentContext, money } from "@/lib/accounting";
import { createPayment } from "./actions";

export default async function PagosPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const [{ data: payments }, { data: contacts }, { data: cashAccounts }, { data: invoices }, { data: bills }] = await Promise.all([
    supabase.from("payments").select("id,payment_date,direction,amount,reference,contacts(display_name),cash_accounts(name)").eq("organization_id", organization.id).order("payment_date", { ascending: false }).limit(100),
    supabase.from("contacts").select("id,display_name").eq("organization_id", organization.id).eq("is_active", true).order("display_name"),
    supabase.from("cash_accounts").select("id,name").eq("organization_id", organization.id).eq("is_active", true).order("name"),
    supabase.from("sales_invoices").select("id,invoice_number").eq("organization_id", organization.id).in("status", ["issued","paid"]).order("issue_date", { ascending: false }),
    supabase.from("purchase_bills").select("id,bill_number").eq("organization_id", organization.id).in("status", ["issued","paid"]).order("issue_date", { ascending: false }),
  ]);

  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">TESORERÍA</p><h1>Pagos</h1><p className="muted">Cobros y pagos con impacto en caja o bancos.</p></div></div>
    <section className="panel"><div className="panel-head"><h2>Nuevo cobro o pago</h2></div>
      <form action={createPayment} className="form-stack">
        <div className="detail-grid">
          <label>Dirección<select name="direction" defaultValue="incoming"><option value="incoming">Cobro</option><option value="outgoing">Pago</option></select></label>
          <label>Fecha<input type="date" name="payment_date" required /></label>
          <label>Importe<input type="number" name="amount" min="0.01" step="0.01" required /></label>
        </div>
        <div className="detail-grid">
          <label>Contacto<select name="contact_id" defaultValue=""><option value="">Sin contacto</option>{(contacts??[]).map(c=><option value={c.id} key={c.id}>{c.display_name}</option>)}</select></label>
          <label>Cuenta de fondos<select name="cash_account_id" defaultValue=""><option value="">Sin cuenta</option>{(cashAccounts??[]).map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
          <label>Factura<select name="sales_invoice_id" defaultValue=""><option value="">Sin factura</option>{(invoices??[]).map(i=><option value={i.id} key={i.id}>{i.invoice_number}</option>)}</select></label>
        </div>
        <div className="detail-grid">
          <label>Compra relacionada<select name="purchase_bill_id" defaultValue=""><option value="">Sin compra</option>{(bills??[]).map(b=><option value={b.id} key={b.id}>{b.bill_number}</option>)}</select></label>
          <label>Referencia<input name="reference" placeholder="Transferencia / recibo" /></label>
          <label>Notas<input name="notes" placeholder="Observaciones" /></label>
        </div>
        <button className="button primary">Registrar operación</button>
      </form>
    </section>
    <section className="panel table-panel"><div className="panel-head"><h2>Últimos cobros y pagos</h2><span className="muted">{payments?.length??0} registros</span></div>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Contacto</th><th>Cuenta</th><th>Tipo</th><th>Importe</th></tr></thead><tbody>{(payments??[]).map(p=>{const c=Array.isArray(p.contacts)?p.contacts[0]:p.contacts;const a=Array.isArray(p.cash_accounts)?p.cash_accounts[0]:p.cash_accounts;return <tr key={p.id}><td>{p.payment_date}</td><td>{c?.display_name||"—"}</td><td>{a?.name||"—"}</td><td>{p.direction==="incoming"?"Cobro":"Pago"}</td><td className="mono">{money(p.amount,organization.currency_code)}</td></tr>})}</tbody></table></div>
    </section>
  </div>;
}
