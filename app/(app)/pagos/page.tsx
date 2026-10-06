import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";

export default async function PagosPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone }).format(new Date());
  const [{ data: agents }, { data: renditions }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,full_name,code,is_active").eq("organization_id", organization.id).eq("is_active", true).order("kind").order("full_name"),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,period_start,period_end,amount_due,status,reference,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(id,payment_date,amount,reference)").eq("organization_id", organization.id).neq("status", "void").order("rendition_date", { ascending: false }).limit(200),
  ]);
  const rows=(renditions??[]).map((row)=>{const payments=Array.isArray(row.agency_rendition_payments)?row.agency_rendition_payments:[];const received=payments.reduce((sum,payment)=>sum+Number(payment.amount??0),0);const pending=Math.max(0,Number(row.amount_due??0)-received);const agent=(agents??[]).find((item)=>item.id===row.agent_id);return {...row,received,pending,agent};});
  const todayRows=rows.filter((row)=>row.rendition_date===today);
  const pendingRows=rows.filter((row)=>row.pending>0);
  const todayDue=todayRows.reduce((sum,row)=>sum+Number(row.amount_due??0),0);
  const todayReceived=todayRows.reduce((sum,row)=>sum+row.received,0);
  const todayPending=Math.max(0,todayDue-todayReceived);
  return (<div className="page"><div className="topbar"><div><p className="eyebrow">RENDICIONES DIARIAS</p><h1>Cobranzas</h1><p className="muted">Cobrá lo rendido por cada subagente y ambulante y mantené visible el saldo pendiente.</p></div><Link href="/agencias" className="button primary">Ver personas</Link></div>
    <div className="stats-grid compact"><div className="stat-card"><span>Rendido hoy</span><strong>{money(todayDue,organization.currency_code)}</strong><small>{todayRows.length} rendiciones</small></div><div className="stat-card"><span>Cobrado hoy</span><strong>{money(todayReceived,organization.currency_code)}</strong><small>cobros asociados a rendiciones</small></div><div className="stat-card"><span>Pendiente hoy</span><strong>{money(todayPending,organization.currency_code)}</strong><small>{todayRows.filter((row)=>row.pending>0).length} rendiciones abiertas</small></div></div>
    <section className="panel"><div className="panel-head"><div><h2>Rendiciones de hoy</h2><p className="muted">Abrí la ficha de la persona para registrar un cobro parcial o total.</p></div><span className="muted">{todayRows.length} registros</span></div><div className="table-wrap"><table><thead><tr><th>Persona</th><th>Tipo</th><th>Período</th><th>Rendido</th><th>Recibido</th><th>Pendiente</th><th>Estado</th><th></th></tr></thead><tbody>
      {todayRows.map((row)=><tr key={row.id}><td>{row.agent?.full_name??"—"}</td><td>{row.agent?.kind==="ambulant"?"Ambulante":"Subagente"}</td><td>{row.period_start||row.rendition_date} → {row.period_end||row.rendition_date}</td><td className="mono">{money(row.amount_due,organization.currency_code)}</td><td className="mono">{money(row.received,organization.currency_code)}</td><td className="mono">{money(row.pending,organization.currency_code)}</td><td><span className={row.pending<=0?"badge success":"badge"}>{row.pending<=0?"Cobrado":row.status==="closed"?"Cerrada":"Pendiente"}</span></td><td><Link href={`/agencias/${row.agent_id}`} className="button primary">Cobrar</Link></td></tr>)}
      {!todayRows.length&&<tr><td colSpan={8}>No hay rendiciones para hoy.</td></tr>}
    </tbody></table></div></section>
    <section className="panel table-panel"><div className="panel-head"><div><h2>Saldo pendiente por persona</h2><p className="muted">Todas las rendiciones abiertas con importe pendiente.</p></div><span className="muted">{pendingRows.length} registros</span></div><div className="table-wrap"><table><thead><tr><th>Persona</th><th>Tipo</th><th>Fecha</th><th>Rendido</th><th>Recibido</th><th>Pendiente</th><th></th></tr></thead><tbody>
      {pendingRows.slice(0,100).map((row)=><tr key={row.id}><td>{row.agent?.full_name??"—"}</td><td>{row.agent?.kind==="ambulant"?"Ambulante":"Subagente"}</td><td>{row.rendition_date}</td><td className="mono">{money(row.amount_due,organization.currency_code)}</td><td className="mono">{money(row.received,organization.currency_code)}</td><td className="mono">{money(row.pending,organization.currency_code)}</td><td><Link href={`/agencias/${row.agent_id}`} className="agency-enter">Registrar cobro →</Link></td></tr>)}
      {!pendingRows.length&&<tr><td colSpan={7}>No hay saldos pendientes.</td></tr>}
    </tbody></table></div></section>
  </div>);
}
