import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";

export default async function RendicionesPage() {
  const {supabase,organization}=await getCurrentContext(); if(!organization) return null; const db=supabase as any;
  const [{data:renditions},{data:agents},{data:payments}]=await Promise.all([
    db.from("agency_renditions").select("id,agent_id,rendition_date,period_start,period_end,amount_due,status,reference").eq("organization_id",organization.id).order("rendition_date",{ascending:false}).limit(300),
    db.from("agency_agents").select("id,kind,full_name,code,is_active").eq("organization_id",organization.id).order("full_name"),
    db.from("agency_rendition_payments").select("rendition_id,amount").eq("organization_id",organization.id).limit(500),
  ]);
  const byId=new Map((agents??[]).map((a:any)=>[a.id,a])); const paid=new Map<string,number>();
  for(const p of payments??[]) paid.set(p.rendition_id,(paid.get(p.rendition_id)??0)+Number(p.amount??0));
  const open=(renditions??[]).filter((r:any)=>r.status==="open");
  const pending=open.reduce((s:number,r:any)=>s+Math.max(0,Number(r.amount_due??0)-(paid.get(r.id)??0)),0);

  return <div className="page"><div className="topbar"><div><p className="eyebrow">CONTROL ADMINISTRATIVO</p><h1>Rendiciones</h1><p className="muted">Todo lo que cada subagente o ambulante debe entregar a la agencia.</p></div><Link href="/agentes" className="button primary">Paneles individuales</Link></div>
    <div className="stats-grid"><div className="stat-card"><span>Rendiciones abiertas</span><strong>{open.length}</strong><small>pendientes de cierre</small></div><div className="stat-card stat-card-pending"><span>Importe pendiente</span><strong>{money(pending,organization.currency_code)}</strong><small>por recibir</small></div><div className="stat-card"><span>Personas cargadas</span><strong>{agents?.length??0}</strong><small>subagentes y ambulantes</small></div><div className="stat-card"><span>Historial</span><strong>{(renditions??[]).filter((r:any)=>r.status!=="void").length}</strong><small>rendiciones registradas</small></div></div>
    <section className="panel table-panel"><div className="panel-head"><div><h2>Listado general</h2><p className="muted">Abrí el panel individual para registrar una recepción.</p></div></div><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Persona</th><th>Tipo</th><th>A rendir</th><th>Recibido</th><th>Pendiente</th><th>Estado</th><th></th></tr></thead><tbody>
      {(renditions??[]).map((r:any)=>{const a=byId.get(r.agent_id);const received=paid.get(r.id)??0;const p=Math.max(0,Number(r.amount_due??0)-received);const status=r.status==="void"?"Anulada":p===0?"Cerrada":received>0?"Parcial":"Abierta";return <tr key={r.id}><td>{r.rendition_date}</td><td><strong>{a?.full_name||"—"}</strong>{a?.code?<div className="table-sub">{a.code}</div>:null}</td><td>{a?.kind==="subagent"?"Subagente":"Ambulante"}</td><td className="mono">{money(r.amount_due,organization.currency_code)}</td><td className="mono">{money(received,organization.currency_code)}</td><td className={p>0?"mono money-pending":"mono"}>{money(p,organization.currency_code)}</td><td><span className={status==="Cerrada"?"badge success":status==="Anulada"?"badge danger":"badge"}>{status}</span></td><td>{a?<Link href={"/agentes/"+a.id} className="table-link">Abrir panel →</Link>:"—"}</td></tr>})}
      {!renditions?.length?<tr><td colSpan={8}>Todavía no hay rendiciones registradas.</td></tr>:null}
    </tbody></table></div></section>
  </div>;
}
