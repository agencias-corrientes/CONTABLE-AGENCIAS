import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { formatAgencyDateTime } from "@/lib/agency-datetime";
import { AgencyCodeInput } from "@/components/agency-code-input";
import { createAgencyAgent, deleteAgencyAgent } from "./actions";

function AgentCard({ agent, pending, lastDate, canDelete }: { agent: any; pending: number; lastDate: string | null; canDelete: boolean }) {
  const subagent = agent.kind === "subagent";
  const typeLabel = subagent ? "SUBAGENTE" : "AMBULANTE";
  return (
    <article className={"agency-agent-card " + (subagent ? "agency-subagent" : "agency-ambulant")}>
      <div className="agency-card-controls">
        <span className={agent.is_active ? "badge success" : "badge"}>{agent.is_active ? "Activo" : "Inactivo"}</span>
        {canDelete && <details className="agency-delete-control">
          <summary>Eliminar</summary>
          <div className="agency-delete-content">
            <p>Si ya tiene rendiciones, se desactiva para conservar su historial. Si no tiene movimientos, se elimina.</p>
            <form action={deleteAgencyAgent}>
              <input type="hidden" name="agent_id" value={agent.id} />
              <label><input type="checkbox" name="confirm_delete" value="yes" required /> Confirmo eliminar {agent.code}</label>
              <button className="button danger small" type="submit">Confirmar</button>
            </form>
          </div>
        </details>}
      </div>
      <Link href={"/pagos?agent=" + agent.id} className="agency-card-open">
        <div className="agency-card-top">
          <span className="agency-kind">{typeLabel}</span>
        </div>
        <div className="agency-code-block">{agent.code || "SIN CÓDIGO"}</div>
        <div className="agency-card-main">
          <div><h3>{agent.full_name}</h3><p>{subagent ? "Subagente" : "Ambulante"}</p></div>
          <span className="agency-card-open-arrow" aria-hidden="true">↗</span>
        </div>
        <div className="agency-card-metrics">
          <div><span>Saldo pendiente</span><strong>{money(pending)}</strong></div>
          <div><span>Última rendición</span><strong>{lastDate || "—"}</strong></div>
        </div>
        <span className="agency-enter">Abrir Rendiciones →</span>
      </Link>
    </article>
  );
}

export default async function AgenciasPage({
  searchParams,
}: {
  searchParams?: Promise<{ resultado?: string; codigo?: string; error?: string; tipo?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, organization, member, userId } = await getCurrentContext();
  if (!organization || !member) return null;
  const isManager = member.role === "owner" || member.role === "admin";
  const { data: staffPermissions } = isManager
    ? { data: { can_create_agents: true, can_delete_agents: true } }
    : await supabase.from("organization_member_permissions").select("can_create_agents,can_delete_agents").eq("organization_id", organization.id).eq("user_id", userId).maybeSingle();
  const canCreateAgents = Boolean(staffPermissions?.can_create_agents);
  const canDeleteAgents = Boolean(staffPermissions?.can_delete_agents);

  const [{ data: agents }, { data: renditions }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,code,full_name,is_active,phone,whatsapp").eq("organization_id", organization.id).order("kind").order("code"),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,created_at,amount_due,status,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(amount)").eq("organization_id", organization.id).neq("status", "void").order("created_at", { ascending: false }),
  ]);

  const pending = new Map<string, number>();
  const lastDate = new Map<string, string>();
  for (const row of renditions ?? []) {
    if (!lastDate.has(row.agent_id)) lastDate.set(row.agent_id, formatAgencyDateTime(row.created_at ?? row.rendition_date));
    const received = (Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    pending.set(row.agent_id, (pending.get(row.agent_id) ?? 0) + Math.max(0, Number(row.amount_due ?? 0) - received));
  }

  const allAgents = agents ?? [];
  const subagents = allAgents.filter((agent) => agent.kind === "subagent" && agent.is_active);
  const ambulants = allAgents.filter((agent) => agent.kind === "ambulant" && agent.is_active);
  const archived = allAgents.filter((agent) => !agent.is_active);

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">ADMINISTRACIÓN DE AGENTES</p><h1>Subagentes y ambulantes</h1><p className="muted">Tarjetas rectangulares con código automático y acceso directo a sus Rendiciones.</p></div>
        <Link href="/pagos" className="button primary">Ir a Rendiciones</Link>
      </div>
      {params.resultado === "archivado" && <p className="message success-message">El agente {params.codigo || ""} tenía rendiciones. Se desactivó para conservar su historial.</p>}
      {params.resultado === "eliminado" && <p className="message success-message">El agente {params.codigo || ""} se eliminó porque no tenía rendiciones asociadas.</p>}
      {params.resultado === "creado" && <p className="message success-message">Se cargó correctamente el agente {params.codigo || ""}.</p>}
      {params.error === "duplicado" && <p className="message error-message">Este {params.tipo === "ambulante" ? "ambulante" : "subagente"} {params.codigo || ""} ya está cargado. No se creó otro registro.</p>}
      {params.error && params.error !== "duplicado" && <p className="message error-message">{({
        "sin-permiso-alta": "No tenés permiso para dar de alta subagentes o ambulantes.",
        "sin-permiso-baja": "Solo el administrador o un empleado autorizado puede eliminar agentes.",
        "tipo-invalido": "El tipo de agente seleccionado no es válido.",
        "codigo-invalido": "Ingresá el código con el formato 251-010-01.",
        "nombre-obligatorio": "Ingresá el nombre del subagente o ambulante.",
        "alta-fallida": "No se pudo guardar el alta. Revisá el código y volvé a intentar.",
        "baja-fallida": "No se pudo completar la baja. No se modificó el historial.",
        "agente-no-encontrado": "No encontramos ese subagente o ambulante."
      } as Record<string,string>)[params.error] ?? "No se pudo completar la operación. Revisá tus permisos o los datos e intentá nuevamente."}</p>}

      {canCreateAgents ? <section className="agency-create-panel">
        <div className="panel-head"><div><h2>Agregar subagente o ambulante</h2><p className="muted">Los guiones aparecen solos al escribir los dígitos del código.</p></div></div>
        <form action={createAgencyAgent} className="agency-create-grid">
          <select name="kind" defaultValue="subagent" aria-label="Tipo de agencia">
            <option value="subagent">Subagente</option>
            <option value="ambulant">Ambulante</option>
          </select>
          <AgencyCodeInput name="code" />
          <input name="full_name" placeholder="Nombre y apellido" required />
          <input name="dni" placeholder="DNI" />
          <input name="phone" placeholder="Teléfono" />
          <input name="whatsapp" placeholder="WhatsApp" />
          <button className="button primary" type="submit">Agregar</button>
        </form>
      </section> : <section className="agency-create-panel"><div className="panel-head"><div><h2>Alta de agentes restringida</h2><p className="muted">El titular debe habilitarte el permiso de alta de subagentes/ambulantes.</p></div></div></section>}

      <section className="agency-section agency-section-subagents">
        <div className="agency-section-head"><div><span>01</span><div><h2>Subagentes</h2><p>Tarjetas amarillas y rojas · un clic para rendir</p></div></div><strong>{subagents.length}</strong></div>
        <div className="agency-card-grid">
          {subagents.map((agent) => <AgentCard key={agent.id} agent={agent} pending={pending.get(agent.id) ?? 0} lastDate={lastDate.get(agent.id) ?? null} canDelete={canDeleteAgents} />)}
          {!subagents.length && <div className="agency-empty">Todavía no hay subagentes activos cargados.</div>}
        </div>
      </section>

      <section className="agency-section agency-section-ambulants">
        <div className="agency-section-head"><div><span>02</span><div><h2>Ambulantes</h2><p>Tarjetas con colores alternados y acceso a su historial</p></div></div><strong>{ambulants.length}</strong></div>
        <div className="agency-card-grid">
          {ambulants.map((agent) => <AgentCard key={agent.id} agent={agent} pending={pending.get(agent.id) ?? 0} lastDate={lastDate.get(agent.id) ?? null} />)}
          {!ambulants.length && <div className="agency-empty">Todavía no hay ambulantes activos cargados.</div>}
        </div>
      </section>

      {!!archived.length && (
        <section className="agency-section archived-agents-section">
          <div className="agency-section-head"><div><span>03</span><div><h2>Agentes inactivos</h2><p>Se conservan acá si tenían rendiciones registradas</p></div></div><strong>{archived.length}</strong></div>
          <div className="agency-card-grid">
            {archived.map((agent) => <AgentCard key={agent.id} agent={agent} pending={pending.get(agent.id) ?? 0} lastDate={lastDate.get(agent.id) ?? null} />)}
          </div>
        </section>
      )}
    </div>
  );
}
