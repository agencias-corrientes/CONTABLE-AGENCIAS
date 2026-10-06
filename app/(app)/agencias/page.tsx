import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { createAgencyAgent } from "./actions";

function AgentCard({ agent, pending, lastDate }: { agent: any; pending: number; lastDate: string | null }) {
  const subagent = agent.kind === "subagent";
  return (
    <Link href={`/agencias/${agent.id}`} className={`agency-agent-card ${subagent ? "agency-subagent" : "agency-ambulant"}`}>
      <div className="agency-card-top">
        <span className="agency-kind">{subagent ? "SUBAGENTE" : "AMBULANTE"}</span>
        <span className={agent.is_active ? "badge success" : "badge"}>{agent.is_active ? "Activo" : "Inactivo"}</span>
      </div>
      <div className="agency-avatar">{agent.full_name.slice(0, 2).toUpperCase()}</div>
      <h3>{agent.full_name}</h3>
      <p>{agent.code ? `Código ${agent.code}` : "Sin código asignado"}</p>
      <div className="agency-card-metrics">
        <div><span>Pendiente</span><strong>{money(pending)}</strong></div>
        <div><span>Última rendición</span><strong>{lastDate || "—"}</strong></div>
      </div>
      <span className="agency-enter">Ingresar a la administración →</span>
    </Link>
  );
}

export default async function AgenciasPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const [{ data: agents }, { data: renditions }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,code,full_name,is_active,phone,whatsapp").eq("organization_id", organization.id).order("kind").order("full_name"),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,amount_due,status,agency_rendition_payments(amount)").eq("organization_id", organization.id).neq("status", "void").order("rendition_date", { ascending: false }),
  ]);

  const pending = new Map<string, number>();
  const lastDate = new Map<string, string>();
  for (const row of renditions ?? []) {
    if (!lastDate.has(row.agent_id)) lastDate.set(row.agent_id, row.rendition_date);
    const received = (Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    pending.set(row.agent_id, (pending.get(row.agent_id) ?? 0) + Math.max(0, Number(row.amount_due ?? 0) - received));
  }

  const subagents = (agents ?? []).filter(a => a.kind === "subagent");
  const ambulants = (agents ?? []).filter(a => a.kind === "ambulant");

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">OPERACIÓN DE AGENCIA</p><h1>Subagentes y ambulantes</h1><p className="muted">Cada persona tiene su propia tarjeta. Ingresá para administrar todos sus datos y rendiciones.</p></div>
      </div>

      <section className="agency-create-panel">
        <div className="panel-head"><div><h2>Agregar persona</h2><p className="muted">El alta queda separada por tipo para mantener ordenada la administración.</p></div></div>
        <form action={createAgencyAgent} className="agency-create-grid">
          <select name="kind" defaultValue="subagent"><option value="subagent">Subagente</option><option value="ambulant">Ambulante</option></select>
          <input name="full_name" placeholder="Nombre y apellido" required />
          <input name="code" placeholder="Código" />
          <input name="dni" placeholder="DNI" />
          <input name="phone" placeholder="Teléfono" />
          <input name="whatsapp" placeholder="WhatsApp" />
          <button className="button primary">Agregar</button>
        </form>
      </section>

      <section className="agency-section agency-section-subagents">
        <div className="agency-section-head"><div><span>01</span><div><h2>Subagentes</h2><p>Administración de subagentes</p></div></div><strong>{subagents.length}</strong></div>
        <div className="agency-card-grid">
          {subagents.map(agent => <AgentCard key={agent.id} agent={agent} pending={pending.get(agent.id) ?? 0} lastDate={lastDate.get(agent.id) ?? null} />)}
          {!subagents.length && <div className="agency-empty">Todavía no hay subagentes cargados.</div>}
        </div>
      </section>

      <section className="agency-section agency-section-ambulants">
        <div className="agency-section-head"><div><span>02</span><div><h2>Ambulantes</h2><p>Administración de ambulantes</p></div></div><strong>{ambulants.length}</strong></div>
        <div className="agency-card-grid">
          {ambulants.map(agent => <AgentCard key={agent.id} agent={agent} pending={pending.get(agent.id) ?? 0} lastDate={lastDate.get(agent.id) ?? null} />)}
          {!ambulants.length && <div className="agency-empty">Todavía no hay ambulantes cargados.</div>}
        </div>
      </section>
    </div>
  );
}
