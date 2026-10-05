import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";

const localDate = (timezone:string) => new Intl.DateTimeFormat("en-CA",{timeZone:timezone}).format(new Date());

export default async function DashboardPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;
  const db = supabase as any;
  const today = localDate(organization.timezone);

  const [{data:agents},{data:renditions},{data:payments}] = await Promise.all([
    db.from("agency_agents").select("id,kind,full_name,code,is_active").eq("organization_id",organization.id).order("full_name"),
    db.from("agency_renditions").select("id,agent_id,rendition_date,amount_due,status").eq("organization_id",organization.id).order("rendition_date",{ascending:false}).limit(500),
    db.from("agency_rendition_payments").select("rendition_id,payment_date,amount").eq("organization_id",organization.id).order("payment_date",{ascending:false}).limit(500),
  ]);

  const paid = new Map<string,number>();
  for (const p of payments ?? []) paid.set(p.rendition_id,(paid.get(p.rendition_id)??0)+Number(p.amount??0));

  const active = (agents??[]).filter((a:any)=>a.is_active);
  const open = (renditions??[]).filter((r:any)=>r.status==="open");
  const pending = open.reduce((s:number,r:any)=>s+Math.max(0,Number(r.amount_due??0)-(paid.get(r.id)??0)),0);
  const receivedToday = (payments??[]).filter((p:any)=>p.payment_date===today).reduce((s:number,p:any)=>s+Number(p.amount??0),0);

  const pendingByAgent = new Map<string,number>();
  for(const r of open){
    const value=Math.max(0,Number(r.amount_due??0)-(paid.get(r.id)??0));
    pendingByAgent.set(r.agent_id,(pendingByAgent.get(r.agent_id)??0)+value);
  }

  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">AGENCIA OFICIAL</p><h1>Panel general</h1><p className="muted">Control de subagentes, ambulantes y dinero rendido en {organization.name}.</p></div><Link href="/agentes" className="button primary">Gestionar agentes</Link></div>

    <div className="stats-grid">
      <div className="stat-card"><span>Subagentes y ambulantes activos</span><strong>{active.length}</strong><small>personas a cargo</small></div>
      <div className="stat-card stat-card-pending"><span>Pendiente de rendición</span><strong>{money(pending,organization.currency_code)}</strong><small>{open.length} rendiciones abiertas</small></div>
      <div className="stat-card"><span>Recibido hoy</span><strong>{money(receivedToday,organization.currency_code)}</strong><small>ingresado en la agencia</small></div>
      <div className="stat-card"><span>Rendiciones registradas</span><strong>{(renditions??[]).filter((r:any)=>r.status!=="void").length}</strong><small>histórico visible</small></div>
    </div>

    <section className="panel agency-highlight">
      <div><p className="eyebrow">VISTA DE AGENCIA</p><h2>Quién debe rendir y cuánto</h2><p className="muted">Cada persona tiene su propio panel para ver saldo, registrar la rendición y recibir dinero.</p></div>
      <Link href="/rendiciones" className="button ghost">Ver todas las rendiciones</Link>
    </section>

    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Subagentes y ambulantes</h2><p className="muted">Acceso directo al panel individual.</p></div><span className="muted">{active.length} activos</span></div>
      {active.length ? <div className="agency-grid">{active.slice(0,9).map((agent:any)=>{
        const value=pendingByAgent.get(agent.id)??0;
        return <Link href={"/agentes/"+agent.id} className="agent-card" key={agent.id}><div className="agent-card-top"><span className="agent-kind">{agent.kind==="subagent"?"SUBAGENTE":"AMBULANTE"}</span>{agent.code?<span className="agent-code">{agent.code}</span>:null}</div><strong>{agent.full_name}</strong><div className={value>0?"agent-balance pending":"agent-balance"}><span>Pendiente</span><b>{money(value,organization.currency_code)}</b></div><span className="agent-link">Abrir panel individual →</span></Link>;
      })}</div> : <div className="empty-state"><div><strong>Todavía no hay subagentes ni ambulantes.</strong><p>Creá el primero para empezar a registrar rendiciones.</p><Link href="/agentes" className="button primary">Agregar agente</Link></div></div>}
    </section>
  </div>;
}
