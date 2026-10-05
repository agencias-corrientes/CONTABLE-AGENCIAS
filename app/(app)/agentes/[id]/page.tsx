import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentContext, money } from "@/lib/accounting";
import { createAgencyRendition, receiveAgencyRendition, recordAgencyRenditionAndReceive } from "./actions";

const today=()=>new Date().toISOString().slice(0,10);

export default async function AgentDetailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string}>}) {
  const {id}=await params; const query=await searchParams;
  const {supabase,organization}=await getCurrentContext(); if(!organization) return null; const db=supabase as any;

  const [{data:agent},{data:renditions},{data:payments},{data:cashAccounts}]=await Promise.all([
    db.from("agency_agents").select("id,kind,full_name,code,phone,whatsapp,address,notes,is_active").eq("id",id).eq("organization_id",organization.id).maybeSingle(),
    db.from("agency_renditions").select("id,rendition_date,period_start,period_end,amount_due,status,reference").eq("agent_id",id).eq("organization_id",organization.id).order("rendition_date",{ascending:false}).limit(100),
    db.from("agency_rendition_payments").select("id,rendition_id,payment_date,amount,reference,cash_accounts(name)").eq("organization_id",organization.id).order("payment_date",{ascending:false}).limit(200),
    db.from("cash_accounts").select("id,name,type,currency_code").eq("organization_id",organization.id).eq("is_active",true).order("name"),
  ]);
  if(!agent) notFound();

  const ownPayments=(payments??[]).filter((p:any)=>(renditions??[]).some((r:any)=>r.id===p.rendition_id));
  const paid=new Map<string,number>(); for(const p of ownPayments) paid.set(p.rendition_id,(paid.get(p.rendition_id)??0)+Number(p.amount??0));
  const open=(renditions??[]).filter((r:any)=>r.status==="open");
  const pending=open.reduce((s:number,r:any)=>s+Math.max(0,Number(r.amount_due??0)-(paid.get(r.id)??0)),0);
  const totalDue=(renditions??[]).filter((r:any)=>r.status!=="void").reduce((s:number,r:any)=>s+Number(r.amount_due??0),0);
  const totalReceived=ownPayments.reduce((s:number,p:any)=>s+Number(p.amount??0),0);

  return <div className="page">
    <Link href="/agentes" className="back-link">← Volver a subagentes y ambulantes</Link>
    <div className="agent-hero"><div><p className="eyebrow">{agent.kind==="subagent"?"SUBAGENTE":"AMBULANTE"}</p><h1>{agent.full_name}</h1><p className="muted">{agent.code?"Código: "+agent.code+" · ":""}{agent.is_active?"Activo":"Inactivo"}</p></div><div className="agent-hero-contact"><span>{agent.whatsapp||agent.phone||"Sin teléfono"}</span>{agent.address?<span>{agent.address}</span>:null}</div></div>
    {query.error?<div className="message">{decodeURIComponent(query.error)}</div>:null}

    <section className="panel quick-rendition-panel">
      <div className="panel-head"><div><p className="eyebrow">OPERACIÓN DIARIA</p><h2>Registrar rendición recibida</h2><p className="muted">Cuando el subagente o ambulante viene a rendir, cargá lo que debía entregar y cuánto dinero recibiste.</p></div></div>
      <form action={recordAgencyRenditionAndReceive} className="agency-rendition-form">
        <input type="hidden" name="agent_id" value={agent.id}/>
        <label>Fecha<input name="rendition_date" type="date" defaultValue={today()} required/></label>
        <label>Desde<input name="period_start" type="date"/></label>
        <label>Hasta<input name="period_end" type="date"/></label>
        <label>A rendir<input name="amount_due" type="number" min="0.01" step="0.01" placeholder="0,00" required/></label>
        <label>Recibido<input name="amount_received" type="number" min="0" step="0.01" placeholder="0,00" required/></label>
        <label>Caja / cuenta<select name="cash_account_id" required><option value="">Seleccionar cuenta</option>{(cashAccounts??[]).map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Referencia<input name="reference" placeholder="Turno, cierre, etc."/></label>
        <label className="form-wide">Observaciones<input name="notes" placeholder="Detalle opcional"/></label>
        <button className="button primary form-wide" disabled={!cashAccounts?.length}>Registrar rendición</button>
      </form>
      <p className="form-hint">Si lo recibido es menor a lo rendido, la diferencia queda pendiente. Si coincide, la rendición se cierra automáticamente.</p>
    </section>

    <div className="stats-grid">
      <div className="stat-card"><span>Total a rendir</span><strong>{money(totalDue,organization.currency_code)}</strong><small>histórico no anulado</small></div>
      <div className="stat-card"><span>Total recibido</span><strong>{money(totalReceived,organization.currency_code)}</strong><small>recepciones registradas</small></div>
      <div className={pending>0?"stat-card stat-card-pending":"stat-card"}><span>Saldo pendiente</span><strong>{money(pending,organization.currency_code)}</strong><small>{open.length} rendiciones abiertas</small></div>
      <div className="stat-card"><span>Rendiciones</span><strong>{(renditions??[]).filter((r:any)=>r.status!=="void").length}</strong><small>historial del agente</small></div>
    </div>

    <div className="detail-grid agency-actions-grid">
      <section className="panel"><div className="panel-head"><div><h2>Nueva rendición</h2><p className="muted">Registrá cuánto debe entregar.</p></div></div>
        <form action={createAgencyRendition} className="form-stack"><input type="hidden" name="agent_id" value={agent.id}/>
          <label>Fecha de rendición<input name="rendition_date" type="date" defaultValue={today()} required/></label>
          <label>Desde<input name="period_start" type="date"/></label><label>Hasta<input name="period_end" type="date"/></label>
          <label>Importe a rendir<input name="amount_due" type="number" min="0.01" step="0.01" required/></label>
          <label>Referencia<input name="reference" placeholder="Cierre del día, turno, etc."/></label>
          <label>Observaciones<input name="notes" placeholder="Detalle opcional"/></label>
          <button className="button primary">Guardar rendición</button>
        </form>
      </section>

      <section className="panel"><div className="panel-head"><div><h2>Recibir dinero</h2><p className="muted">La recepción ingresa también a Caja.</p></div></div>
        {open.length?<form action={receiveAgencyRendition} className="form-stack">
          <label>Rendición<select name="rendition_id" required>{open.map((r:any)=>{const p=Math.max(0,Number(r.amount_due??0)-(paid.get(r.id)??0));return <option key={r.id} value={r.id}>{r.rendition_date+" · pendiente "+money(p,organization.currency_code)}</option>})}</select></label>
          <label>Fecha<input name="payment_date" type="date" defaultValue={today()} required/></label>
          <label>Importe recibido<input name="amount" type="number" min="0.01" step="0.01" required/></label>
          <label>Caja / cuenta<select name="cash_account_id" required><option value="">Seleccionar cuenta</option>{(cashAccounts??[]).map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Referencia<input name="reference" placeholder="Efectivo, transferencia, etc."/></label><label>Observaciones<input name="notes" placeholder="Detalle opcional"/></label>
          <button className="button primary" disabled={!cashAccounts?.length}>Registrar recepción</button>
        </form>:<div className="empty-state compact-empty"><div><strong>No hay rendiciones abiertas.</strong><p>Primero registrá cuánto debe rendir.</p></div></div>}
      </section>
    </div>

    <section className="panel table-panel"><div className="panel-head"><div><h2>Historial de rendiciones</h2><p className="muted">Lo rendido y lo que todavía queda pendiente.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Período</th><th>A rendir</th><th>Recibido</th><th>Pendiente</th><th>Estado</th><th>Referencia</th></tr></thead><tbody>
        {(renditions??[]).map((r:any)=>{const received=paid.get(r.id)??0;const p=Math.max(0,Number(r.amount_due??0)-received);const status=r.status==="void"?"Anulada":p===0?"Cerrada":received>0?"Parcial":"Abierta";return <tr key={r.id}><td>{r.rendition_date}</td><td>{r.period_start||r.period_end?(r.period_start||"—")+" a "+(r.period_end||"—"):"—"}</td><td className="mono">{money(r.amount_due,organization.currency_code)}</td><td className="mono">{money(received,organization.currency_code)}</td><td className={p>0?"mono money-pending":"mono"}>{money(p,organization.currency_code)}</td><td><span className={status==="Cerrada"?"badge success":status==="Anulada"?"badge danger":"badge"}>{status}</span></td><td>{r.reference||"—"}</td></tr>})}
        {!renditions?.length?<tr><td colSpan={7}>Todavía no hay rendiciones.</td></tr>:null}
      </tbody></table></div>
    </section>

    <section className="panel table-panel"><div className="panel-head"><h2>Últimas recepciones</h2></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Importe</th><th>Caja</th><th>Referencia</th></tr></thead><tbody>
      {ownPayments.slice(0,20).map((p:any)=>{const c=Array.isArray(p.cash_accounts)?p.cash_accounts[0]:p.cash_accounts;return <tr key={p.id}><td>{p.payment_date}</td><td className="mono">{money(p.amount,organization.currency_code)}</td><td>{c?.name||"—"}</td><td>{p.reference||"—"}</td></tr>})}
      {!ownPayments.length?<tr><td colSpan={4}>Todavía no hay recepciones registradas.</td></tr>:null}
    </tbody></table></div></section>
  </div>;
}
