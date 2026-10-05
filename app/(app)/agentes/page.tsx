import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { createAgencyAgent } from "./actions";

export default async function AgentesPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;
  const db = supabase as any;

  const [{data:agents},{data:renditions},{data:payments}] = await Promise.all([
    db.from("agency_agents").select("id,kind,full_name,code,phone,whatsapp,is_active").eq("organization_id",organization.id).order("is_active",{ascending:false}).order("full_name"),
    db.from("agency_renditions").select("id,agent_id,amount_due,status").eq("organization_id",organization.id).neq("status","void").limit(500),
    db.from("agency_rendition_payments").select("rendition_id,amount").eq("organization_id",organization.id).limit(500),
  ]);

  const paid=new Map<string,number>();
  for(const p of payments??[]) paid.set(p.rendition_id,(paid.get(p.rendition_id)??0)+Number(p.amount??0));
  const pendingByAgent=new Map<string,number>();
  for(const r of renditions??[]) if(r.status==="open") pendingByAgent.set(r.agent_id,(pendingByAgent.get(r.agent_id)??0)+Math.max(0,Number(r.amount_due??0)-(paid.get(r.id)??0)));
  const params=await searchParams;

  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">RED DE AGENCIA</p><h1>Subagentes y ambulantes</h1><p className="muted">Un panel individual para cada persona que trabaja con la agencia oficial.</p></div></div>
    {params.error?<div className="message">{decodeURIComponent(params.error)}</div>:null}
    <section className="panel">
      <div className="panel-head"><div><h2>Agregar subagente o ambulante</h2><p className="muted">La persona queda asociada únicamente a esta agencia.</p></div></div>
      <form action={createAgencyAgent} className="agency-agent-form">
        <select name="kind" defaultValue="subagent" required><option value="subagent">Subagente</option><option value="ambulant">Ambulante</option></select>
        <input name="full_name" placeholder="Nombre y apellido" required />
        <input name="code" placeholder="Código interno" />
        <input name="phone" placeholder="Teléfono" />
        <input name="whatsapp" placeholder="WhatsApp" />
        <input name="address" placeholder="Domicilio" />
        <input name="notes" placeholder="Observaciones" />
        <button className="button primary">Agregar</button>
      </form>
    </section>

    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Paneles individuales</h2><p className="muted">Abrí una persona para controlar sus rendiciones.</p></div><span className="muted">{agents?.length??0} personas</span></div>
      {agents?.length ? <div className="agency-grid">{agents.map((agent:any)=>{
        const pending=pendingByAgent.get(agent.id)??0;
        return <Link href={"/agentes/"+agent.id} className="agent-card" key={agent.id}>
          <div className="agent-card-top"><span className="agent-kind">{agent.kind==="subagent"?"SUBAGENTE":"AMBULANTE"}</span>{agent.code?<span className="agent-code">{agent.code}</span>:null}</div>
          <strong>{agent.full_name}</strong><span className="agent-contact">{agent.whatsapp||agent.phone||"Sin teléfono"}</span>
          <div className={pending>0?"agent-balance pending":"agent-balance"}><span>Saldo pendiente</span><b>{money(pending,organization.currency_code)}</b></div>
          <span className="agent-link">Ver panel →</span>{!agent.is_active?<span className="badge">Inactivo</span>:null}
        </Link>;
      })}</div>:<div className="empty-state"><div><strong>No hay personas cargadas.</strong><p>Agregá los subagentes y ambulantes que rinden en esta agencia.</p></div></div>}
    </section>
  </div>;
}
