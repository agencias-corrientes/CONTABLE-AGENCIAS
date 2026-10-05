import Link from "next/link";
import { getCurrentContext,money } from "@/lib/accounting";

export default async function DashboardPage(){
 const {supabase:rawSupabase,organization}=await getCurrentContext();
 const supabase:any=rawSupabase;
 if(!organization)return null;
 const id=organization.id;
 const [a,r,p,c]=await Promise.all([
  supabase.from("agency_agents").select("id,kind",{count:"exact",head:false}).eq("organization_id",id).eq("is_active",true),
  supabase.from("agency_renditions").select("id,agent_id,amount_due,status,agency_agents(full_name,kind)").eq("organization_id",id).eq("status","open").order("rendition_date",{ascending:false}).limit(8),
  supabase.from("agency_rendition_payments").select("amount").eq("organization_id",id),
  supabase.from("cash_movements").select("direction,amount").eq("organization_id",id)
 ]);
 const received=(p.data??[]).reduce((s:number,x:any)=>s+Number(x.amount),0);
 const cash=(c.data??[]).reduce((s:number,x:any)=>s+(x.direction==="incoming"?1:-1)*Number(x.amount),0);
 const pending=(r.data??[]).reduce((s:number,x:any)=>s+Number(x.amount_due),0);
 const sub=(a.data??[]).filter((x:any)=>x.kind==="subagent").length;
 const amb=(a.data??[]).filter((x:any)=>x.kind==="ambulant").length;

 return <div className="page"><div className="topbar"><div><p className="eyebrow">CONTROL ADMINISTRATIVO</p><h1>Panel de la agencia</h1><p className="muted">{organization.name}. Todo lo importante de la operación diaria en un solo lugar.</p></div><Link href="/agencia" className="button primary">Abrir agencia</Link></div>
  <div className="stats-grid"><div className="stat-card"><span>Subagentes</span><strong>{sub}</strong><small>activos</small></div><div className="stat-card"><span>Ambulantes</span><strong>{amb}</strong><small>activos</small></div><div className="stat-card stat-card-pending"><span>Por rendir</span><strong>{money(pending,organization.currency_code)}</strong><small>rendiciones abiertas</small></div><div className="stat-card"><span>Recibido</span><strong>{money(received,organization.currency_code)}</strong><small>rendiciones registradas</small></div></div>
  <section className="dashboard-grid"><div className="panel large"><div className="panel-head"><div><h2>Operación de hoy</h2><p className="muted">Accesos rápidos para el agente oficial.</p></div></div><div className="quick-grid"><Link href="/agencia" className="quick-card"><strong>👥 Operadores</strong><span>Subagentes y ambulantes</span></Link><Link href="/agencia/rendiciones" className="quick-card"><strong>💰 Rendiciones</strong><span>Pendientes, parciales y cerradas</span></Link><Link href="/movimientos" className="quick-card"><strong>🏦 Caja</strong><span>Dinero recibido y movimientos</span></Link><Link href="/agencia/cierre" className="quick-card"><strong>✓ Cierre diario</strong><span>Control de cada jornada</span></Link></div></div><div className="panel"><div className="panel-head"><h2>Saldo de caja</h2></div><div className="stat-card"><span>Fondos registrados</span><strong>{money(cash,organization.currency_code)}</strong><small>ingresos menos egresos</small></div></div></section>
  <section className="panel table-panel"><div className="panel-head"><div><h2>Rendiciones pendientes</h2><p className="muted">Las que requieren seguimiento.</p></div></div><div className="table-wrap"><table><thead><tr><th>Operador</th><th>Tipo</th><th>Importe</th><th></th></tr></thead><tbody>{(r.data??[]).map((x:any)=>{const ag=Array.isArray(x.agency_agents)?x.agency_agents[0]:x.agency_agents;return <tr key={x.id}><td>{ag?.full_name}</td><td>{ag?.kind==="subagent"?"Subagente":"Ambulante"}</td><td>{money(x.amount_due,organization.currency_code)}</td><td><Link className="table-link" href={"/agencia/"+x.agent_id}>Ver ficha →</Link></td></tr>})}</tbody></table></div></section>
 </div>
}