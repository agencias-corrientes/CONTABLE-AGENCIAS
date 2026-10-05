import { getCurrentContext, money } from "@/lib/accounting";
import { createPurchaseBill } from "./actions";

export default async function ComprasPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const [{ data: bills }, { data: contacts }] = await Promise.all([
    supabase.from("purchase_bills").select("id,bill_number,issue_date,due_date,status,total_amount,contacts(display_name)").eq("organization_id", organization.id).order("issue_date", { ascending: false }).limit(100),
    supabase.from("contacts").select("id,display_name").eq("organization_id", organization.id).eq("type", "vendor").eq("is_active", true).order("display_name"),
  ]);

  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">EGRESOS</p><h1>Compras</h1><p className="muted">Comprobantes de proveedores y cuentas por pagar.</p></div></div>
    <section className="panel">
      <div className="panel-head"><h2>Nuevo comprobante en borrador</h2></div>
      <form action={createPurchaseBill} className="form-stack">
        <div className="detail-grid">
          <label>Número<input name="bill_number" placeholder="0001-00000456" required /></label>
          <label>Fecha<input type="date" name="issue_date" required /></label>
          <label>Vencimiento<input type="date" name="due_date" /></label>
        </div>
        <div className="detail-grid">
          <label>Proveedor<select name="contact_id" defaultValue=""><option value="">Sin proveedor</option>{(contacts??[]).map(c=><option value={c.id} key={c.id}>{c.display_name}</option>)}</select></label>
          <label>Concepto<input name="item_description" placeholder="Compra / servicio" required /></label>
          <label>Cantidad<input type="number" name="quantity" min="0.01" step="0.01" defaultValue="1" required /></label>
        </div>
        <div className="detail-grid">
          <label>Precio unitario<input type="number" name="unit_price" min="0" step="0.01" required /></label>
          <label>IVA %<input type="number" name="tax_rate" min="0" step="0.01" defaultValue="0" /></label>
          <label>Notas<input name="notes" placeholder="Observaciones" /></label>
        </div>
        <button className="button primary">Guardar compra</button>
      </form>
    </section>
    <section className="panel table-panel"><div className="panel-head"><h2>Últimos comprobantes</h2><span className="muted">{bills?.length??0} registros</span></div>
      <div className="table-wrap"><table><thead><tr><th>Comprobante</th><th>Fecha</th><th>Proveedor</th><th>Estado</th><th>Total</th></tr></thead><tbody>{(bills??[]).map(row=>{const c=Array.isArray(row.contacts)?row.contacts[0]:row.contacts;return <tr key={row.id}><td className="mono">{row.bill_number}</td><td>{row.issue_date}</td><td>{c?.display_name||"—"}</td><td>{row.status}</td><td className="mono">{money(row.total_amount,organization.currency_code)}</td></tr>})}</tbody></table></div>
    </section>
  </div>;
}
