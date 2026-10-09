import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { createAgencyAgent } from "./actions";

function AgentCard({ agent, pending, lastDate }: { agent: any; pending: number; lastDate: string | null }) {
  const subagent = agent.kind === "subagent";
  const typeLabel = subagent ? "SUBAGENTE" : "AMBULANTE";
  return (
    <Link href={`/agencias/${agent.id}`} className={`agency-agent-card ${subagent ? "agency-subagent" : "agency-ambulant"}`}>
      <div className="agency-card-top">
        <span className="agency-kind">{typeLabel}</span>
        <span className={agent.is_active ? "badge success" : "badge"}>{agent.is_active ? "Activo" : "Inactivo"}</span>
      </div>
      <div className="agency-code-block">{agent.code || "SIN CÓDIGO"}</div>
      <h3>{agent.full_name}</h3>
      <p>{subagent ? "Subagente" : "Ambulante"}</p>
      <div className="agency-card-metrics">
        <div><span>Pendiente jornada actual</span><strong>{money(pending)}</strong></div>
        <div><span>Última rendición</span><strong>{lastDate || "—"}</strong></div>
      </div>
      <span className="agency-enter">Ingresar a la administración →</span>
    </Link>
  );
}

export default async function AgenciasPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const [{ data: agents }, { data: renditions }, { data: operationalSettings }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,code,full_name,is_active,phone,whatsapp").eq("organization_id", organization.id).order("kind").order("code"),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,amount_due,status,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(amount)").eq("organization_id", organization.id).neq("status", "void").order("rendition_date", { ascending: false }),
    (supabase as any).from("agency_operational_settings").select("rendition_cutoff_time").eq("organization_id", organization.id).maybeSingle(),
  ]);

  const pending = new Map<string, number>();
  const lastDate = new Map<string, string>();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: organization.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  let journeyDate = `${part("year")}-${part("month")}-${part("day")}`;
  const currentTime = `${part("hour")}:${part("minute")}`;
  const cutoffTime = String(operationalSettings?.rendition_cutoff_time ?? "00:00:00").slice(0, 5);
  if (currentTime < cutoffTime) {
    const previousDay = new Date(`${journeyDate}T00:00:00Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    journeyDate = previousDay.toISOString().slice(0, 10);
  }
  for (const row of renditions ?? []) {
    if (!lastDate.has(row.agent_id)) lastDate.set(row.agent_id, row.rendition_date);
    if (row.rendition_date !== journeyDate) continue;
    const received = (Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    pending.set(row.agent_id, (pending.get(row.agent_id) ?? 0) + Math.max(0, Number(row.amount_due ?? 0) - received));
  }

  const subagents = (agents ?? []).filter(a => a.kind === "subagent");
  const ambulants = (agents ?? []).filter(a => a.kind === "ambulant");

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">OPERACIÓN DE AGENCIA</p><h1>Subagentes y ambulantes</h1><p className="muted">Administrá cada subagente y ambulante por su código, datos y rendiciones. El saldo de estas tarjetas corresponde solo a la jornada actual; las deudas anteriores siguen disponibles en Cobranzas.</p></div>
      </div>

      <section className="agency-create-panel">
        <div className="panel-head"><div><h2>Agregar subagente o ambulante</h2><p className="muted">Seleccioná el tipo y asigná el código operativo.</p></div></div>
        <form action={createAgencyAgent} className="agency-create-grid">
          <select name="kind" defaultValue="subagent" aria-label="Tipo de agencia">
            <option value="subagent">Subagente</option>
            <option value="ambulant">Ambulante</option>
          </select>
          <input name="code" placeholder="Código: 251-010-01" pattern="[0-9]{3}-[0-9]{3}-[0-9]{2}" title="Usá el formato 251-010-01" required />
          <input name="full_name" placeholder="Nombre y apellido" required />
          <input name="dni" placeholder="DNI" />
          <input name="phone" placeholder="Teléfono" />
          <input name="whatsapp" placeholder="WhatsApp" />
          <button className="button primary">Agregar</button>
        </form>
      </section>

      <section className="agency-section agency-section-subagents">
        <div className="agency-section-head"><div><span>01</span><div><h2>Subagentes</h2><p>Códigos y administración de subagentes</p></div></div><strong>{subagents.length}</strong></div>
        <div className="agency-card-grid">
          {subagents.map(agent => <AgentCard key={agent.id} agent={agent} pending={pending.get(agent.id) ?? 0} lastDate={lastDate.get(agent.id) ?? null} />)}
          {!subagents.length && <div className="agency-empty">Todavía no hay subagentes cargados.</div>}
        </div>
      </section>

      <section className="agency-section agency-section-ambulants">
        <div className="agency-section-head"><div><span>02</span><div><h2>Ambulantes</h2><p>Códigos y administración de ambulantes</p></div></div><strong>{ambulants.length}</strong></div>
        <div className="agency-card-grid">
          {ambulants.map(agent => <AgentCard key={agent.id} agent={agent} pending={pending.get(agent.id) ?? 0} lastDate={lastDate.get(agent.id) ?? null} />)}
          {!ambulants.length && <div className="agency-empty">Todavía no hay ambulantes cargados.</div>}
        </div>
      </section>
    </div>
  );
}