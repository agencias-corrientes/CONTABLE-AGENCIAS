import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";

export default async function DashboardPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone }).format(new Date());
  const [{ data: agents }, { data: renditions }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,full_name,code,is_active").eq("organization_id", organization.id).order("kind").order("full_name"),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,amount_due,status,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(amount)").eq("organization_id", organization.id).neq("status", "void").order("rendition_date", { ascending: false }).limit(100),
  ]);
  const rows = (renditions ?? []).map((row) => {
    const payments = Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : [];
    const received = payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    const due = Number(row.amount_due ?? 0);
    return { ...row, received, pending: Math.max(0, due - received) };
  });
  const subagents = (agents ?? []).filter((agent) => agent.kind === "subagent");
  const ambulants = (agents ?? []).filter((agent) => agent.kind === "ambulant");
  const todayRows = rows.filter((row) => row.rendition_date === today);
  const todayDue = todayRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
  const todayReceived = todayRows.reduce((sum, row) => sum + row.received, 0);
  const todayPending = Math.max(0, todayDue - todayReceived);
  const openCount = rows.filter((row) => row.pending > 0).length;
  return (<div className="page">
    <div className="topbar"><div><p className="eyebrow">OPERACIÓN DIARIA</p><h1>Control de subagentes y ambulantes</h1><p className="muted">Desde acá concentrás altas, rendiciones y cobranzas de cada persona.</p></div><Link href="/agencias" className="button primary">Administrar personas</Link></div>
    <div className="stats-grid">
      <div className="stat-card"><span>Subagentes</span><strong>{subagents.length}</strong><small>personas activas en la operación</small></div>
      <div className="stat-card"><span>Ambulantes</span><strong>{ambulants.length}</strong><small>personas activas en la operación</small></div>
      <div className="stat-card"><span>Rendido hoy</span><strong>{money(todayDue, organization.currency_code)}</strong><small>{todayRows.length} rendiciones del día</small></div>
      <div className="stat-card"><span>Pendiente de cobro</span><strong>{money(todayPending, organization.currency_code)}</strong><small>{openCount} rendiciones con saldo</small></div>
    </div>
    <section className="dashboard-grid">
      <div className="panel large"><div className="panel-head"><div><h2>Rendiciones de hoy</h2><p className="muted">Seguimiento inmediato de lo que cada persona debe rendir y de lo ya cobrado.</p></div><Link href="/pagos" className="button ghost">Ver cobranzas</Link></div>
        <div className="table-wrap"><table><thead><tr><th>Persona</th><th>Tipo</th><th>Importe</th><th>Recibido</th><th>Pendiente</th><th></th></tr></thead><tbody>
          {todayRows.slice(0, 12).map((row) => { const agent=(agents??[]).find((item)=>item.id===row.agent_id); return <tr key={row.id}><td>{agent?.full_name??"—"}</td><td>{agent?.kind==="ambulant"?"Ambulante":"Subagente"}</td><td className="mono">{money(row.amount_due, organization.currency_code)}</td><td className="mono">{money(row.received, organization.currency_code)}</td><td className="mono">{money(row.pending, organization.currency_code)}</td><td><Link href={`/agencias/${row.agent_id}`} className="agency-enter">Abrir →</Link></td></tr>; })}
          {!todayRows.length && <tr><td colSpan={6}>No hay rendiciones cargadas para hoy.</td></tr>}
        </tbody></table></div>
      </div>
      <div className="panel"><div className="panel-head"><div><h2>Acciones rápidas</h2><p className="muted">Operación diaria.</p></div></div><div className="quick-grid quick-grid-focus"><Link href="/agencias" className="quick-card quick-card-agencies"><strong>Subagentes y ambulantes</strong><span>{subagents.length} subagentes · {ambulants.length} ambulantes</span></Link><Link href="/pagos" className="quick-card"><strong>Cobrar rendición</strong><span>Registrar cobros sobre la rendición de cada persona.</span></Link></div><div className="check-list"><div><span>✓</span> Rendición diaria centralizada</div><div><span>✓</span> Saldo pendiente por persona</div><div><span>✓</span> Cobros asociados a cada rendición</div></div></div>
    </section>
  </div>);
}
