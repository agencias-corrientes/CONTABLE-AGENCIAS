import { getCurrentContext, money } from "@/lib/accounting";
import { createSalesInvoice, issueSalesInvoice } from "./actions";

export default async function VentasPage(){
  const {supabase,organization}=await getCurrentContext();
  if(!organization) return null;
  const [{data:invoices},{data:contacts}]=await Promise.all([
    supabase.from("sales_invoices").select("id,invoice_number,issue_date,due_date,status,total_amount,contacts(display_name)").eq("organization_id",organization.id).order("issue_date",{ascending:false}).limit(100),
    supabase.from("contacts").select("id,display_name").eq("organization_id",organization.id).eq("type","customer").eq("is_active",true).order("display_name")
  ]);
  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">INGRESOS</p><h1>Ventas</h1><p className="muted">Facturación y cuentas por cobrar.</p></div></div>
    <section className="panel"><div className="panel-head"><h2>Nueva factura en borrador</h2></div><form action={createSalesInvoice} className="form-stack">
      <div className="detail-grid"><label>Número<input name="invoice_number" placeholder="0001-00000123" required/></label><label>Fecha<input type="date" name="issue_date" required/></label><label>Vencimiento<input type="date" name="due_date"/></label></div>
      <div className="detail-grid"><label>Cliente<select name="contact_id" defaultValue=""><option value="">Sin cliente</option>{(contacts??[]).map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label><label>Concepto<input name="item_description" placeholder="Servicio / producto" required/></label><label>Cantidad><input type="number" name="quantity" min="0.01" step="0.01" defaultValue="1" required/></label></div>
      <div className="detail-grid"><label>Precio unitario<input type="number" name="unit_price" min="0" step="0.01" required/></label><label>IVA %<input type="number" name="tax_rate" min="0" step="0.01" defaultValue="0"/></label><label>Notas<input name="notes" placeholder="Observaciones"/></label></div>
      <button className="button primary">Guardar factura</button>
    </form></section>
    <section className="panel table-panel"><div className="panel-head"><h2>Últimas facturas</h2><span className="muted">{invoices?.length??0} registros</span></div>
      <div className="table-wrap"><table><thead><tr><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>{(invoices??[]).map(row=>{const c=Array.isArray(row.contacts)?row.contacts[0]:row.contacts;return <tr key={row.id}><td className="mono">{row.invoice_number}</td><td>{row.issue_date}</td><td>{c?.display_name||"—"}</td><td><span className={row.status==="paid"?"badge success":"badge"}>{row.status}</span></td><td className="mono">{money(row.total_amount,organization.currency_code)}</td><td>{row.status==="draft"?<form action={issueSalesInvoice} className="inline-action"><input type="hidden" name="invoice_id" value={row.id}/><button className="button ghost">Emitir</button></form>:"—"}</td></tr>})}</tbody></table></div>
    </section>
  </div>;
}
