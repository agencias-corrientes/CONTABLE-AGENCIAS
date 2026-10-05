import { getCurrentContext, money } from "@/lib/accounting";

export default async function VentasPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select("id,invoice_number,issue_date,due_date,status,total_amount,contacts(display_name)")
    .eq("organization_id", organization.id)
    .order("issue_date", { ascending: false })
    .limit(100);

  return <SimpleDocumentPage title="Ventas" eyebrow="INGRESOS" description="Facturación, cuentas por cobrar y seguimiento de ventas." rows={invoices ?? []} currency={organization.currency_code} numberKey="invoice_number" contactKey="contacts" action="Nueva factura" />;
}

function SimpleDocumentPage({ title, eyebrow, description, rows, currency, numberKey, contactKey, action }: { title: string; eyebrow: string; description: string; rows: any[]; currency: string; numberKey: string; contactKey: string; action: string }) {
  return (
    <div className="page">
      <div className="topbar"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div><button className="button primary">{action}</button></div>
      <section className="panel table-panel"><div className="panel-head"><h2>Últimos registros</h2><span className="muted">{rows.length} registros</span></div>
        <div className="table-wrap"><table><thead><tr><th>Comprobante</th><th>Fecha</th><th>Contacto</th><th>Estado</th><th>Total</th></tr></thead>
        <tbody>{rows.map((row) => { const contact = Array.isArray(row[contactKey]) ? row[contactKey][0] : row[contactKey]; return <tr key={row.id}><td className="mono">{row[numberKey]}</td><td>{row.issue_date}</td><td>{contact?.display_name || "—"}</td><td>{row.status}</td><td className="mono">{money(row.total_amount, currency)}</td></tr>; })}</tbody></table></div>
      </section>
    </div>
  );
}
