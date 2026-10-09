import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";
import { DailyBoundaryRefresh } from "@/components/daily-boundary-refresh";
import { agencyBusinessDateForCutoff } from "@/lib/agency-datetime";
import { getOfficialDrawPeriodsForDate, OFFICIAL_QUINIELA_SCHEDULE_URL, OFFICIAL_EXTRACTS_SCHEDULE_URL } from "@/lib/agency-draw-schedule";
import { AgencyCodeInput } from "@/components/agency-code-input";
import { createAgencyAgent, deleteAgencyAgent } from "./actions";

function AgentCard({ agent, canDelete }: { agent: any; canDelete: boolean }) {
  const subagent = agent.kind === "subagent";
  const typeLabel = subagent ? "subagente" : "ambulante";
  return (
    <div className={"agency-agent-button-row " + (subagent ? "agency-subagent" : "agency-ambulant")}>
      <Link
        href={"/pagos?agent=" + agent.id}
        className="agency-agent-code-button"
        aria-label={"Abrir rendición de " + typeLabel + " " + agent.code}
        title={"Abrir rendición de " + typeLabel + " " + agent.code}
      >
        {agent.code || "SIN CÓDIGO"}
      </Link>
      <details className="agency-agent-actions">
        <summary aria-label={"Opciones de " + typeLabel + " " + agent.code} title="Opciones">⋯</summary>
        <div className="agency-agent-actions-menu">
          <span className={agent.is_active ? "badge success" : "badge"}>{agent.is_active ? "Activo" : "Inactivo"}</span>
          <Link href={"/agencias/" + agent.id}>Editar comisión</Link>
          {canDelete && (
            <form action={deleteAgencyAgent}>
              <input type="hidden" name="agent_id" value={agent.id} />
              <label><input type="checkbox" name="confirm_delete" value="yes" required /> Confirmo eliminar {agent.code}</label>
              <button className="button danger small" type="submit">Confirmar baja</button>
            </form>
          )}
        </div>
      </details>
    </div>
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
  const isManager = member.role === "owner";
  const { data: staffPermissions } = isManager
    ? { data: { can_create_agents: true, can_delete_agents: true } }
    : await supabase.from("organization_member_permissions").select("can_create_agents,can_delete_agents").eq("organization_id", organization.id).eq("user_id", userId).maybeSingle();
  const canCreateAgents = Boolean(staffPermissions?.can_create_agents);
  const canDeleteAgents = Boolean(staffPermissions?.can_delete_agents);

  const [{ data: agents }, { data: operationalSettings }] = await Promise.all([
    supabase.from("agency_agents")
      .select("id,kind,code,full_name,is_active,phone,whatsapp")
      .eq("organization_id", organization.id)
      .order("kind")
      .order("code"),
    supabase.from("agency_operational_settings")
      .select("rendition_cutoff_time")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);
  const cutoffTime = String(operationalSettings?.rendition_cutoff_time ?? "00:00").slice(0, 5);
  const today = agencyBusinessDateForCutoff(cutoffTime);
  const periods = getOfficialDrawPeriodsForDate(today);


  const allAgents = agents ?? [];
  const subagents = allAgents.filter((agent) => agent.kind === "subagent" && agent.is_active);
  const ambulants = allAgents.filter((agent) => agent.kind === "ambulant" && agent.is_active);
  const archived = allAgents.filter((agent) => !agent.is_active);

  return (
    <div className="page">
      <DailyBoundaryRefresh businessDate={today} cutoffTime={cutoffTime} drawTimes={periods.map((period) => period.time).filter((time): time is string => Boolean(time))} renderedAt={new Date().toISOString()} />
      <div className="topbar">
        <div><p className="eyebrow">ADMINISTRACIÓN DE AGENTES</p><h1>Subagentes y ambulantes</h1><p className="muted">Cada código muestra el estado independiente de cada sorteo; los turnos vencidos sin rendición quedan pendientes.</p><p className="muted small-text"><a href={OFFICIAL_QUINIELA_SCHEDULE_URL} target="_blank" rel="noreferrer">Cronograma oficial de Lotería Correntina</a> · <a href={OFFICIAL_EXTRACTS_SCHEDULE_URL} target="_blank" rel="noreferrer">Resultados y sorteos publicados</a></p></div>
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
        <div className="agency-section-head"><div><span>01</span><div><h2>Subagentes</h2><p>Botones compactos · un clic para rendir</p></div></div><strong>{subagents.length}</strong></div>
        <div className="agency-agent-button-list">
          {subagents.map((agent) => <AgentCard key={agent.id} agent={agent} canDelete={canDeleteAgents}  />)}
          {!subagents.length && <div className="agency-empty">Todavía no hay subagentes activos cargados.</div>}
        </div>
      </section>

      <section className="agency-section agency-section-ambulants">
        <div className="agency-section-head"><div><span>02</span><div><h2>Ambulantes</h2><p>Botones compactos · un clic para rendir</p></div></div><strong>{ambulants.length}</strong></div>
        <div className="agency-agent-button-list">
          {ambulants.map((agent) => <AgentCard key={agent.id} agent={agent} canDelete={canDeleteAgents} drawStatuses={statusForAgent(String(agent.id)).map((entry) => ({ label: entry.label, status: entry.status, description: entry.description }))} />)}
          {!ambulants.length && <div className="agency-empty">Todavía no hay ambulantes activos cargados.</div>}
        </div>
      </section>

      {!!archived.length && (
        <section className="agency-section archived-agents-section">
          <div className="agency-section-head"><div><span>03</span><div><h2>Agentes inactivos</h2><p>Se conservan acá si tenían rendiciones registradas</p></div></div><strong>{archived.length}</strong></div>
          <div className="agency-agent-button-list">
            {archived.map((agent) => <AgentCard key={agent.id} agent={agent} canDelete={canDeleteAgents} />)}
          </div>
        </section>
      )}
    </div>
  );
}
