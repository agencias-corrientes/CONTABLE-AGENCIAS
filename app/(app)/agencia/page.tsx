import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { createAgent } from "./actions";

export default async function AgenciaPage(){
 const {supabase:rawSupabase,organization}=await getCurrentContext();
 const supabase:any=rawSupabase;
 if(!organization)return null;
 const id=organization.id;
 const [agents,rends,pays,cashMovements]=await Promise.all([
  supabase.from("agency_agents").select("id,kind,full_name,code,phone,whatsapp").eq("organization_id",id).eq("is_active",true).order("kind").order("full_name"),
  supabase.from("agency_renditions").select("id,agent_id,rendition_date,amount_due,status,agency_agents(full_name,kind)").eq("organization_id",id).neq("status","void").order("rendition_date",{ascending:false}).limit(100),
  supabase.from("agency_rendition_payments").select("amount").eq("organization_id",id),
  supabase.from("cash_movements").select("direction,amount").eq("organization_id",id)
 ]);
 const due=(rends.data??[]).reduce((s:number,r:any)=>s+Number(r.amount_due),0);
 const received=(pays.data??[]).reduce((s:number,r:any)=>s+Number(r.amount),0);
 const pending=Math.max(due-received,0);
 const cash=(cashMovements.data??[]).reduce((s:number,r:any)=>s+(r.direction==="incoming"?1:-1)*Number(r.amount),0);
 const sub=(agents.data??[]).filter((a:any)=>a.kind==="subagent").length;
 const amb=(agents.data??[]).filter((a:any)=>a.kind==="ambulant").length;

 return <div className="page">
  <div className="topbar"><div><p className="eyebrow">AGENCIA OFICIAL</p><h1>Agencia {organization.name}</h1><p className="muted">Centro de control de subagentes, ambulantes y rendiciones.</p></div><div><Link href="/agencia/cierre" className="button ghost">Cierre diario</Link></div></div>
  <div className="stats-grid"><div className="stat-card"><span>Subagentes</span><strong>{sub}</strong><small>activos</small></div><div className="stat-card"><span>Ambulantes</span><strong>{amb}</strong><small>activos</small></div><div className="stat-card stat-card-pending"><span>Pendiente de rendición</span><strong>{money(pending,organization.currency_code)}</strong><small>total abierto</small></div><div className="stat-card"><span>Saldo de caja</span><strong>{money(cash,organization.currency_code)}</strong><small>movimientos registrados</small></div></div>
  <section className="panel agency-highlight"><div><p className="eyebrow">OPERACIÓN DIARIA</p><h2>Centro de control</h2><p className="muted">Administrá operadores, cargá rendiciones y recibí el dinero de la agencia.</p></div><div className="quick-grid agency-actions-grid"><a href="#nuevo-operador" className="quick-card"><strong>+ Nuevo operador</strong><span>Subagente o ambulante</span></a><Link href="/agencia/rendiciones" className="quick-card"><strong>Rendiciones</strong><span>Ver pendientes y cerradas</span></Link></div></section>
  <section className="panel"><div className="panel-head"><div><h2>Subagentes y ambulantes</h2><p className="muted">Cada operador tiene su propio panel.</p></div><span className="badge">{agents.data?.length??0} activos</span></div><div className="agency-grid">{(agents.data??[]).map((a:any)=><Link className="agent-card" href={"/agencia/"+a.id} key={a.id}><div className="agent-card-top"><span className="agent-kind">{a.kind==="subagent"?"SUBAGENTE":"AMBULANTE"}</span><span className="agent-code">{a.code||"Sin código"}</span></div><strong>{a.full_name}</strong><span className="agent-contact">{a.whatsapp||a.phone||"Sin contacto"}</span><div className="agent-balance"><span>Abrir panel</span><b>→</b></div></Link>)}</div>{!agents.data?.length&&<div className="empty-state">Todavía no hay operadores cargados.</div>}</section>
  <section className="panel table-panel"><div className="panel-head"><div><h2>Últimas rendiciones</h2><p className="muted">Seguimiento general.</p></div><Link className="table-link" href="/agencia/rendiciones">Ver todas →</Link></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Operador</th><th>Tipo</th><th>Debe rendir</th><th>Estado</th></tr></thead><tbody>{(rends.data??[]).slice(0,12).map((r:any)=>{const a=Array.isArray(r.agency_agents)?r.agency_agents[0]:r.agency_agents;return <tr key={r.id}><td>{r.rendition_date}</td><td><Link className="table-link" href={"/agencia/"+r.agent_id}>{a?.full_name||"—"}</Link></td><td>{a?.kind==="subagent"?"Subagente":"Ambulante"}</td><td className="mono">{money(r.amount_due,organization.currency_code)}</td><td><span className={"badge "+(r.status==="closed"?"success":"")}>{r.status==="closed"?"Cerrada":"Abierta"}</span></td></tr>})}</tbody></table></div></section>
  <section className="panel form-panel" id="nuevo-operador"><div className="panel-head"><div><h2>Nuevo operador</h2><p className="muted">Alta de un subagente o ambulante.</p></div></div><form action={createAgent} className="agency-agent-form"><select name="kind" required><option value="subagent">Subagente</option><option value="ambulant">Ambulante</option></select><input name="full_name" placeholder="Nombre y apellido" required/><input name="code" placeholder="Código"/><input name="dni" placeholder="DNI"/><input name="phone" placeholder="Teléfono"/><input name="whatsapp" placeholder="WhatsApp"/><input name="address" placeholder="Domicilio"/><input name="notes" placeholder="Observaciones"/><button className="button primary">Crear operador</button></form></section>
 </div>;
}