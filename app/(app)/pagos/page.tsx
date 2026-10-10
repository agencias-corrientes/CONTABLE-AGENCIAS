import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { getOfficialAgencyGame } from "@/lib/agency-official-games";
import { agencyBusinessDateForCutoff, formatAgencyDate, formatAgencyDateTime } from "@/lib/agency-datetime";
import { getAllOfficialDrawPeriods, getOfficialDrawPeriodsForDate, getAgencyLocalClock, getDrawPeriodStatus, getPreferredPendingDrawPeriod, drawPeriodHasPassed } from "@/lib/agency-draw-schedule";
import { DailyBoundaryRefresh } from "@/components/daily-boundary-refresh";
import { RenditionScrollHelper } from "@/components/rendition-scroll-helper";
import { RenditionEntryForm } from "@/components/rendition-entry-form";
import { receiveAgencyRendition, voidAgencyRendition, setAgencyDrawRenditionStatus, setAgencyDailyRenditionStatus, sendAgencyBackupManually } from "../agencias/actions";

type GameAmount = {
  id: string;
  game_type_id: string;
  amount: number | string;
  commission_percent: number | string;
  commission_amount: number | string;
  agency_game_types: { id: string; name: string; category: string } | null;
};

export default async function PagosPage({ searchParams }: { searchParams?: Promise<{ agent?: string; busqueda?: string; resultado?: string; error?: string; backup?: string; foto?: string; copias?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const selectedAgentId = params.agent ?? "";
  const searchTerm = (params.busqueda ?? "").trim();
  const normalizedSearch = searchTerm.toLocaleLowerCase("es-AR");
  const { supabase, organization, member, userId } = await getCurrentContext();
  if (!organization || !member) return null;
  const activeOrganization = organization;
  const manager = member.role === "owner";
  const { data: permissions } = manager
    ? { data: { can_create_renditions: true, can_edit_renditions: true, can_delete_renditions: true, can_register_payments: true, can_manage_backups: true } }
    : await supabase.from("organization_member_permissions").select("can_create_renditions,can_edit_renditions,can_delete_renditions,can_register_payments,can_manage_backups").eq("organization_id", activeOrganization.id).eq("user_id", userId).maybeSingle();
  const canCreateRenditions = Boolean(permissions?.can_create_renditions);
  const canEditRenditions = Boolean(permissions?.can_edit_renditions);
  const canDeleteRenditions = Boolean(permissions?.can_delete_renditions);
  const canRegisterPayments = Boolean(permissions?.can_register_payments);

  const [{ data: operationalSettings }, { data: agents }, { data: gameTypes }] = await Promise.all([
    supabase.from("agency_operational_settings").select("rendition_cutoff_time").eq("organization_id", activeOrganization.id).maybeSingle(),
    supabase.from("agency_agents").select("id,kind,full_name,code,is_active,phone,rendition_policy,rendition_periods").eq("organization_id", activeOrganization.id).order("kind").order("code"),
    supabase.from("agency_game_types").select("id,name,category,enabled").eq("organization_id", activeOrganization.id).order("sort_order").order("name"),
  ]);
  const cutoffTime = String(operationalSettings?.rendition_cutoff_time ?? "00:00").slice(0, 5);
  const today = agencyBusinessDateForCutoff(cutoffTime);
  async function loadAllRenditions() {
    const accumulated: any[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("agency_renditions")
        .select("id,agent_id,rendition_date,created_at,updated_at,game_period,draw_number,capture_method,amount_due,status,reference,notes,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(id,payment_date,amount,reference),agency_rendition_game_amounts(id,game_type_id,amount,commission_percent,commission_amount,agency_game_types(id,name,category)),agency_rendition_tickets(id,ticket_number,ticket_qr_payload)")
        .eq("organization_id", activeOrganization.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error("No se pudo cargar el historial completo de rendiciones: " + error.message);
      const batch = data ?? [];
      accumulated.push(...batch);
      if (batch.length < pageSize) return accumulated;
    }
  }
  const renditions = await loadAllRenditions();
  const { data: drawStatusRows } = await supabase
    .from("agency_agent_draw_status")
    .select("agent_id,draw_period,rendition_id,status,notes,reported_amount,updated_at")
    .eq("organization_id", activeOrganization.id)
    .eq("operational_date", today);
  const drawStatusByKey = new Map((drawStatusRows ?? []).map((row: any) => [String(row.agent_id) + "|" + String(row.draw_period), row]));
  const { data: dailyStatusRows } = await supabase.from("agency_agent_daily_status")
    .select("agent_id,status,notes,reported_amount,updated_at").eq("organization_id", activeOrganization.id).eq("operational_date", today);
  const dailyStatusByAgent = new Map((dailyStatusRows ?? []).map((row: any) => [String(row.agent_id), row]));

  async function loadHistoricalDailyStatuses() {
    const accumulated: any[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("agency_agent_daily_status")
        .select("agent_id,operational_date,status,notes,reported_amount,updated_at")
        .eq("organization_id", activeOrganization.id)
        .lt("operational_date", today)
        .order("operational_date", { ascending: false })
        .order("agent_id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error("No se pudieron cargar los estados diarios anteriores: " + error.message);
      const batch = data ?? [];
      accumulated.push(...batch);
      if (batch.length < pageSize) return accumulated;
    }
  }
  async function loadHistoricalDrawStatuses() {
    const accumulated: any[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("agency_agent_draw_status")
        .select("agent_id,operational_date,draw_period,rendition_id,status,notes,reported_amount,updated_at")
        .eq("organization_id", activeOrganization.id)
        .lt("operational_date", today)
        .order("operational_date", { ascending: false })
        .order("agent_id", { ascending: true })
        .order("draw_period", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error("No se pudieron cargar los estados por sorteo anteriores: " + error.message);
      const batch = data ?? [];
      accumulated.push(...batch);
      if (batch.length < pageSize) return accumulated;
    }
  }
  const [historicalDailyStatusRows, historicalDrawStatusRows] = await Promise.all([
    loadHistoricalDailyStatuses(),
    loadHistoricalDrawStatuses(),
  ]);
  const drawPeriods = getOfficialDrawPeriodsForDate(today);
  const allOfficialDrawPeriods = getAllOfficialDrawPeriods();
  const dailyClosurePeriod = { label: "Cierre diario", shortLabel: "Cierre diario", time: null, gameName: "Cierre diario", kind: "daily" as const };
  const drawNow = new Date();
  const lastScheduledDraw = drawPeriods.filter((period) => period.time).sort((left, right) => String(left.time).localeCompare(String(right.time))).at(-1);
  const dailyCloseAllowed = lastScheduledDraw ? drawPeriodHasPassed(lastScheduledDraw, today, drawNow) : false;

  const agentRows = agents ?? [];
  const activeAgents = agentRows.filter((agent) => agent.is_active);
  const archivedAgents = agentRows.filter((agent) => !agent.is_active);
  const allRows = (renditions ?? []) as any[];
  const rows = allRows.filter((row) => row.status !== "void");
  const voidRows = allRows.filter((row) => row.status === "void");
  const isCurrentOperationalDay = (row: any) => agencyBusinessDateForCutoff(cutoffTime, String(row.created_at ?? "")) === today;
  const todayRows = rows.filter(isCurrentOperationalDay);
  // Las anulaciones también quedan visibles en el historial: no se borra el rastro del día.
  const historicalRows = allRows.filter((row) => !isCurrentOperationalDay(row));
  const historicalByDay = new Map<string, any[]>();
  for (const row of historicalRows) {
    const day = agencyBusinessDateForCutoff(cutoffTime, String(row.created_at ?? ""));
    historicalByDay.set(day, [...(historicalByDay.get(day) ?? []), row]);
  }
  const historicalDailyStatusesByDay = new Map<string, any[]>();
  const historicalDailyStatusByAgentAndDay = new Map<string, any>();
  for (const status of historicalDailyStatusRows ?? []) {
    const day = String(status.operational_date);
    historicalDailyStatusesByDay.set(day, [...(historicalDailyStatusesByDay.get(day) ?? []), status]);
    historicalDailyStatusByAgentAndDay.set(day + "|" + String(status.agent_id), status);
  }
  const historicalDrawStatusesByDay = new Map<string, any[]>();
  const historicalDrawStatusesByAgentAndDay = new Map<string, any[]>();
  for (const status of historicalDrawStatusRows ?? []) {
    const day = String(status.operational_date);
    const key = day + "|" + String(status.agent_id);
    historicalDrawStatusesByDay.set(day, [...(historicalDrawStatusesByDay.get(day) ?? []), status]);
    historicalDrawStatusesByAgentAndDay.set(key, [...(historicalDrawStatusesByAgentAndDay.get(key) ?? []), status]);
  }
  const historicalDays = Array.from(new Set([
    ...historicalByDay.keys(),
    ...historicalDailyStatusesByDay.keys(),
    ...historicalDrawStatusesByDay.keys(),
  ]))
    .sort((a, b) => b.localeCompare(a))
    .map((day) => ({
      day,
      rows: historicalByDay.get(day) ?? [],
      dailyStatuses: historicalDailyStatusesByDay.get(day) ?? [],
      drawStatuses: historicalDrawStatusesByDay.get(day) ?? [],
    }));
  const filteredActiveAgents = activeAgents.filter((agent) => {
    if (!normalizedSearch) return true;
    return [agent.code, agent.full_name, agent.phone ?? "", agent.kind === "subagent" ? "subagente" : "ambulante"]
      .some((value) => String(value).toLocaleLowerCase("es-AR").includes(normalizedSearch));
  });
  const selectedAgent = activeAgents.find((agent) => String(agent.id) === selectedAgentId);
  const todayRendido = todayRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
  const todayCobrado = todayRows.reduce((sum, row) => sum + (Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : []).reduce((subtotal: number, payment: any) => subtotal + Number(payment.amount ?? 0), 0), 0);
  const todayPendiente = Math.max(0, todayRendido - todayCobrado);
  const allGames = (gameTypes ?? []).filter((game) => Boolean(getOfficialAgencyGame(game.name))).map((game) => ({ id: game.id, name: game.name, category: game.category, enabled: game.enabled }));
  const games = allGames.filter((game) => game.enabled).map(({ id, name, category }) => ({ id, name, category }));
  const agentLabel = (agent: any) => agent.kind === "subagent" ? "Subagente" : "Ambulante";
  const rowTotals = (row: any) => {
    const payments = Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : [];
    const received = payments.reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);
    return { received, pending: Math.max(0, Number(row.amount_due ?? 0) - received), payments };
  };

  function drawPeriodStateForAgent(agentId: string, period: ReturnType<typeof getOfficialDrawPeriodsForDate>[number]) {
    const activeRendition = todayRows.find((row: any) =>
      String(row.agent_id) === agentId &&
      String(row.game_period ?? "").trim() === period.label &&
      row.status !== "void"
    ) as any;
    const savedStatus = drawStatusByKey.get(agentId + "|" + period.label) as any;
    return getDrawPeriodStatus(
      period,
      today,
      activeRendition ? { id: String(activeRendition.id), game_period: activeRendition.game_period } : null,
      savedStatus ?? null,
      drawNow
    );
  }
  function drawPeriodStatesForAgent(agentId: string) {
    return drawPeriods.map((period) => ({ period, ...drawPeriodStateForAgent(agentId, period) }));
  }
  const legacyUnlabelledTodayCount = todayRows.filter((row: any) => !String(row.game_period ?? "").trim()).length;

  function RenditionHistory({ agent, historyRows = rows }: { agent: any; historyRows?: any[] }) {
    const agentRows = historyRows.filter((row) => String(row.agent_id) === String(agent.id));
    if (!agentRows.length) return <div className="rendition-history-empty">Todavía no hay rendiciones guardadas para este operador.</div>;
    return (
      <div className="rendition-history-list">
        {agentRows.map((row) => {
          const totals = rowTotals(row);
          const gameAmounts = (Array.isArray(row.agency_rendition_game_amounts) ? row.agency_rendition_game_amounts : []) as GameAmount[];
          const tickets = Array.isArray(row.agency_rendition_tickets) ? row.agency_rendition_tickets : [];
          return (
            <details className="rendition-record" key={row.id}>
              <summary>
                <span className="rendition-record-date">{formatAgencyDate(row.rendition_date)}<small>{formatAgencyDateTime(row.created_at)}</small></span>
                <span className="rendition-record-agent-code" aria-label={"Código del operador " + agent.code} title={"Código del operador " + agent.code}>{agent.code}</span>
                <span className="rendition-record-period">{row.game_period || "Período no identificado"}{row.draw_number ? <small>Sorteo {row.draw_number}</small> : null}</span>
                <span className="rendition-record-amount">{money(row.amount_due, activeOrganization.currency_code)}<small>{row.capture_method === "manual" ? "Carga manual" : row.capture_method === "qr" ? "Foto / QR" : "Foto del ticket"}</small></span>
                <span className={row.status === "void" ? "badge" : totals.pending <= 0 ? "badge success" : "badge"}>{row.status === "void" ? "Anulada" : totals.pending <= 0 ? "Cobrada" : "Pendiente " + money(totals.pending, activeOrganization.currency_code)}</span>
              </summary>
              <div className="rendition-record-detail">
                <div className="rendition-detail-columns">
                  <div>
                    <h4>Detalle por juego</h4>
                    {gameAmounts.length ? <ul className="rendition-game-amounts">{gameAmounts.map((game) => <li key={game.id}><span>{game.agency_game_types?.name ?? "Juego"}<small className="commission-note">{Number(game.commission_percent ?? 0).toFixed(2)}% comisión · {money(game.commission_amount ?? 0, activeOrganization.currency_code)}</small></span><strong>{money(game.amount, activeOrganization.currency_code)}<small className="commission-note">neto {money(Number(game.amount) - Number(game.commission_amount ?? 0), activeOrganization.currency_code)}</small></strong></li>)}</ul> : <p className="muted">No hay juegos asociados.</p>}
                    <p className="rendition-grand-total"><span>Total rendido</span><strong>{money(row.amount_due, activeOrganization.currency_code)}</strong></p>
                  </div>
                  <div>
                    <h4>Ticket, período y observaciones</h4>
                    <dl className="rendition-metadata">
                      <div><dt>Fecha del juego</dt><dd>{formatAgencyDate(row.rendition_date)}</dd></div>
                      <div><dt>Período / turno</dt><dd>{row.game_period || "—"}</dd></div>
                      <div><dt>Número de sorteo</dt><dd>{row.draw_number || "—"}</dd></div>
                      <div><dt>Registrada</dt><dd>{formatAgencyDateTime(row.created_at)}</dd></div>
                      <div><dt>Referencia</dt><dd>{row.reference || "—"}</dd></div>
                    </dl>
                    {tickets.length > 0 && <div className="ticket-saved-list"><strong>Tickets guardados</strong>{tickets.map((ticket: any) => <div key={ticket.id}><code>{ticket.ticket_number}</code>{ticket.ticket_qr_payload && <small>QR: {ticket.ticket_qr_payload.slice(0, 100)}{ticket.ticket_qr_payload.length > 100 ? "…" : ""}</small>}</div>)}</div>}
                    {row.notes && <p className="muted rendition-saved-notes">{row.notes}</p>}
                  </div>
                </div>
                {totals.payments.length > 0 && (
                  <div className="rendition-saved-payments">
                    <h4>Cobros registrados</h4>
                    <ul>
                      {totals.payments.map((payment: any) => (
                        <li key={payment.id}>
                          <span>{formatAgencyDate(payment.payment_date)}{payment.reference ? " · " + payment.reference : ""}</span>
                          <strong>{money(payment.amount, activeOrganization.currency_code)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="rendition-payment-summary"><span>Cobrado: <strong>{money(totals.received, activeOrganization.currency_code)}</strong></span><span>Pendiente: <strong>{money(totals.pending, activeOrganization.currency_code)}</strong></span></div>
                {row.status !== "void" && totals.pending > 0 && canRegisterPayments && (
                  <details className="agency-pay-details">
                    <summary>Registrar cobro en Caja</summary>
                    <form action={receiveAgencyRendition} className="agency-pay-form">
                      <input type="hidden" name="rendition_id" value={row.id} />
                      <input type="hidden" name="agent_id" value={agent.id} />
                      <label>Fecha de cobro<input type="date" name="payment_date" defaultValue={today} required /></label>
                      <label>Importe<input type="number" name="amount" min="0.01" max={totals.pending} step="0.01" placeholder="Importe" required /></label>
                      <input name="reference" placeholder="Referencia (opcional)" />
                      <span className="agency-cash-fixed">Caja</span>
                      <button className="button primary" type="submit">Registrar cobro</button>
                    </form>
                  </details>
                )}
                {row.status !== "void" && totals.pending > 0 && !canRegisterPayments && <p className="muted small-text">No tenés permiso para registrar cobros. El titular debe habilitar esta operación.</p>
                {canEditRenditions && totals.received <= 0 && row.status === "open" && String(row.game_period ?? "").trim() && getOfficialDrawPeriodsForDate(String(row.rendition_date)).some((period) => period.label === row.game_period) && (
                  <details className="rendition-edit-details">
                    <summary>Modificar rendición</summary>
                    <div className="rendition-correction-panel">
                      <p className="muted small-text">Los cambios guardan una revisión nueva y conservan el registro en auditoría. Solo se permite editar antes de registrar cobros.</p>
                      <RenditionEntryForm
                        agentId={agent.id}
                        games={allGames}
                        today={today}
                        periods={getOfficialDrawPeriodsForDate(String(row.rendition_date))}
                        allPeriods={allOfficialDrawPeriods}
                        defaultPeriod={String(row.game_period ?? "")}
                        initialRendition={{
                          id: row.id,
                          renditionDate: row.rendition_date,
                          period: row.game_period,
                          drawNumber: row.draw_number,
                          amounts: Object.fromEntries(gameAmounts.map((game) => [game.game_type_id, Number(game.amount).toFixed(2)])),
                          ticketNumbers: tickets.map((ticket: any) => String(ticket.ticket_number)),
                          qrPayload: tickets.find((ticket: any) => ticket.ticket_qr_payload)?.ticket_qr_payload ?? "",
                          reference: row.reference,
                          notes: row.notes,
                          captureMethod: row.capture_method,
                        }}
                      />
                    </div>
                  </details>
                )}
                {canEditRenditions && totals.received > 0 && <p className="message">Esta rendición tiene cobros registrados; no puede editarse hasta resolver esos movimientos de Caja.</p>}
                {canEditRenditions && totals.received <= 0 && row.status === "open" && (!String(row.game_period ?? "").trim() || !getOfficialDrawPeriodsForDate(String(row.rendition_date)).some((period) => period.label === row.game_period)) && <p className="message">Esta rendición histórica no tiene un período oficial identificable. Se conserva y no se reasigna automáticamente.</p>}
                {canDeleteRenditions && totals.received <= 0 && row.status === "open" && (
                  <details className="rendition-void-details">
                    <summary>Anular rendición y conservar historial</summary>
                    <form action={voidAgencyRendition} className="rendition-void-form">
                      <input type="hidden" name="rendition_id" value={row.id} />
                      <input type="hidden" name="agent_id" value={agent.id} />
                      <label>Motivo de anulación<textarea name="reason" rows={2} placeholder="Ej.: se cargó el ticket equivocado" /></label>
                      <label><input type="checkbox" name="confirm_void" value="yes" required /> Confirmo anular esta rendición sin borrar su historial</label>
                      <button className="button danger small" type="submit">Anular rendición</button>
                    </form>
                  </details>
                )}
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  function AgentAccordion({ agent }: { agent: any }) {
    const todayAgentRows = todayRows.filter((row) => row.agent_id === agent.id);
    const renditionPolicy = String(agent.rendition_policy ?? "daily");
    const configuredRenditionPeriods = Array.isArray(agent.rendition_periods) ? agent.rendition_periods.map(String) : [];
    const dailyRendition = todayAgentRows.find((row: any) => String(row.game_period ?? "").trim() === "Cierre diario");
    const dailyStatus = dailyStatusByAgent.get(String(agent.id)) as any;
    const agentPeriodStates = renditionPolicy === "daily" ? [] : drawPeriodStatesForAgent(String(agent.id))
      .filter((entry) => renditionPolicy !== "selected_draws" || configuredRenditionPeriods.includes(entry.period.label));
    const formPeriods = agentPeriodStates.filter((entry) => entry.status === "pending" && !entry.hasRendition).map((entry) => entry.period);
    const defaultPeriod = getPreferredPendingDrawPeriod(formPeriods)?.label ?? "";
    const due = todayAgentRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
    const commission = todayAgentRows.reduce((sum, row) => sum + (Array.isArray(row.agency_rendition_game_amounts) ? row.agency_rendition_game_amounts : []).reduce((acc: number, game: any) => acc + Number(game.commission_amount ?? 0), 0), 0);
    const netDue = Math.max(0, due - commission);
    const subagent = agent.kind === "subagent";
    const incompleteDraws = agentPeriodStates.filter((entry) => entry.status === "incomplete");
    const dailyStatusKind = !dailyRendition ? "pending" : dailyStatus?.status === "complete" ? "complete" : dailyStatus?.status === "incomplete" ? "incomplete" : "review";
    const dailyStatusLabel = !dailyRendition ? "Pendiente: Rendición del día" : dailyStatusKind === "complete" ? "Rendición del día confirmada" : dailyStatusKind === "incomplete" ? "Rendición del día incompleta" : "Rendición del día registrada · revisar estado";

    return (
      <div className={"rendition-agent-accordion " + (subagent ? "rendition-subagent" : "rendition-ambulant")}>
        <div className="rendition-agent-expanded">
          <div className="rendition-agent-expanded-head">
            <div><span className="eyebrow">{renditionPolicy === "daily" ? "RENDICIÓN DEL DÍA" : renditionPolicy === "selected_draws" ? "SORTEOS SELECCIONADOS" : "RENDICIONES POR SORTEO"}</span><h3>{agentLabel(agent)} {agent.code} · {agent.full_name}</h3><p className="muted">{renditionPolicy === "daily" ? "Una sola rendición reúne los importes de todos los juegos del día." : renditionPolicy === "selected_draws" ? "Solo se controlan los sorteos habilitados para este operador." : "Cada sorteo tiene su rendición independiente."} Comisión acumulada: <strong>{money(commission, activeOrganization.currency_code)}</strong> · Neto estimado: <strong>{money(netDue, activeOrganization.currency_code)}</strong>.</p></div>
            <Link href={"/agencias/" + agent.id} className="button ghost">Configurar</Link>
          </div>
          <div className="draw-period-chip-list expanded-draw-period-list" aria-label={"Estados de rendición de " + agent.code}>
            {renditionPolicy === "daily"
              ? <span className={"draw-period-chip status-" + dailyStatusKind}>{dailyStatusLabel}</span>
              : agentPeriodStates.map((entry) => <span key={entry.period.label} className={"draw-period-chip status-" + entry.status} title={entry.description}>{entry.label}</span>)}
          </div>
          {canCreateRenditions && incompleteDraws.length > 0 && <div className="draw-period-status-actions">
            {incompleteDraws.map((entry) => <form key={entry.period.label} action={setAgencyDrawRenditionStatus}>
              <input type="hidden" name="agent_id" value={agent.id} />
              <input type="hidden" name="operational_date" value={today} />
              <input type="hidden" name="draw_period" value={entry.period.label} />
              <input type="hidden" name="status" value="complete" />
              <button className="button ghost" type="submit">Confirmar {entry.period.shortLabel} como rendida</button>
            </form>)}
          </div>}
          {renditionPolicy === "daily" && dailyRendition && dailyStatusKind === "incomplete" && canCreateRenditions && <form action={setAgencyDailyRenditionStatus} className="draw-period-status-actions">
            <input type="hidden" name="agent_id" value={agent.id} /><input type="hidden" name="operational_date" value={today} /><input type="hidden" name="status" value="complete" />
            <button className="button primary" type="submit">Confirmar rendición del día</button>
          </form>}
          {canCreateRenditions
            ? renditionPolicy === "daily"
              ? dailyRendition
                ? <p className="message">La rendición del día ya está registrada para esta jornada. Revisá el historial para ver los importes de todos los juegos.</p>
                : dailyCloseAllowed
                  ? <RenditionEntryForm agentId={agent.id} games={games} today={today} periods={[dailyClosurePeriod]} allPeriods={allOfficialDrawPeriods} defaultPeriod="Cierre diario" dailyMode />
                  : <p className="message">La rendición del día estará disponible después del último horario de sorteo de hoy{lastScheduledDraw?.time ? " (" + lastScheduledDraw.time + ")" : ""}.</p>
              : formPeriods.length > 0
                ? <RenditionEntryForm agentId={agent.id} games={games} today={today} periods={formPeriods} allPeriods={allOfficialDrawPeriods} defaultPeriod={defaultPeriod} />
                : <p className="message">No hay otro sorteo habilitado vencido pendiente para registrar. Los turnos futuros se habilitan cuando llega su horario.</p>
            : <p className="message">No tenés permiso para registrar rendiciones. El titular debe habilitar esta operación.</p>}
          <section className="rendition-agent-history">
            <div className="panel-head"><div><h3>Rendiciones del día operativo</h3><p className="muted">Los períodos anteriores quedan en el historial; el nuevo sorteo vuelve a quedar pendiente por separado.</p></div><span className="muted">{todayAgentRows.length} registros</span></div>
            <RenditionHistory agent={agent} historyRows={todayRows} />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page rendition-page-clean">
      <DailyBoundaryRefresh businessDate={today} cutoffTime={cutoffTime} drawTimes={drawPeriods.map((period) => period.time).filter((time): time is string => Boolean(time))} renderedAt={new Date().toISOString()} />
      <RenditionScrollHelper />
      {!selectedAgentId ? (
        <>
          <div className="topbar rendition-page-topbar">
            <div>
              <p className="eyebrow">CONTROL OPERATIVO DIARIO</p>
              <h1>Rendiciones</h1>
            </div>
            {manager && (
              <form action={sendAgencyBackupManually} className="rendition-manual-backup-form">
                <button className="button primary" type="submit" title="Enviar ahora las copias pendientes de esta agencia">Enviar backup manual</button>
              </form>
            )}
          </div>
      {params.resultado === "backup-manual-enviado" && <p className="message success-message">Backup manual enviado al correo configurado: {Math.max(0, Number(params.copias ?? 0))} rendición(es). El cierre automático continúa programado.</p>}
      {params.resultado === "backup-sin-pendientes" && <p className="message">No había respaldos pendientes para enviar. Las copias guardadas siguen disponibles en el historial.</p>}
      {params.resultado === "sorteo-rendido" && <p className="message success-message">Se confirmó el estado de ese sorteo; los demás períodos no se modificaron.</p>}
      {params.resultado === "rendicion-creada" && <p className={(params.backup === "enviado" || params.backup === "cierre-diario") ? "message success-message" : "message backup-pending-message"}>Rendición registrada correctamente. {params.backup === "cierre-diario" ? "La copia quedó acumulada para enviarse en un único correo al cierre de la jornada." : params.backup === "enviado" ? "El backup de texto se envió al correo configurado para el titular." : params.backup === "dominio-no-verificado" ? "La rendición y su copia de texto se conservaron, pero Resend bloqueó el envío porque falta verificar un dominio y usarlo en la dirección del remitente. Configurá el dominio en Resend y RESEND_FROM_EMAIL en los secretos de la función de Supabase; después reintentá desde Personal y permisos." : "El respaldo quedó guardado, pero el correo no confirmó la entrega. Revisá el estado en Personal y permisos."}{params.foto === "no-adjunta" ? " La foto no se adjuntó; el respaldo de texto se conserva." : ""}</p>}
      {params.resultado === "rendicion-corregida" && <p className={(params.backup === "enviado" || params.backup === "cierre-diario") ? "message success-message" : "message backup-pending-message"}>Rendición corregida. Se conserva la auditoría y se creó una nueva revisión del respaldo. {params.backup === "cierre-diario" ? "La nueva revisión quedó acumulada para el correo único de cierre diario." : params.backup === "enviado" ? "El correo se envió." : params.backup === "dominio-no-verificado" ? "Resend rechazó el envío porque falta verificar un dominio y usar una dirección remitente de ese dominio. La copia permanece guardada; configurá Resend y reintentá desde Personal y permisos." : "El correo no confirmó entrega; la revisión permanece guardada para reintento."}</p>}
      {params.resultado === "rendicion-anulada" && <p className={(params.backup === "enviado" || params.backup === "cierre-diario") ? "message success-message" : "message backup-pending-message"}>Rendición anulada con historial conservado. {params.backup === "cierre-diario" ? "El respaldo actualizado quedó acumulado para el correo único de cierre diario." : params.backup === "enviado" ? "El respaldo actualizado se envió al correo del titular." : params.backup === "dominio-no-verificado" ? "La rendición anulada y su respaldo siguen registrados, pero Resend requiere verificar un dominio y configurar la dirección remitente antes de enviar. Reintentá después de esa configuración." : "El respaldo quedó registrado, pero el correo no confirmó entrega."}</p>}
      {params.resultado === "estado-rendida" && <p className="message success-message">Estado actualizado: rendición confirmada como completa para esta jornada.</p>}
      {params.resultado === "estado-incompleta" && <p className="message backup-pending-message">Estado actualizado: rendición marcada como incompleta. Podés dejar una observación para recordar qué falta.</p>}
      {params.error === "solo-titular-configuracion" && <p className="message error-message">La configuración es exclusiva del titular de la agencia.</p>}
      {params.error && params.error !== "solo-titular-configuracion" && <p className="message error-message">{({
        "sin-permiso-rendicion": "No tenés permiso para registrar rendiciones.",
        "sin-permiso-cobro": "No tenés permiso para registrar cobros.",
        "sin-permiso-editar": "No tenés permiso para corregir rendiciones.",
        "sin-permiso-anular": "No tenés permiso para anular rendiciones.",
        "rendicion-invalida": "No se identificó la rendición que querés corregir.",
        "fecha-invalida": "La fecha del juego no es válida.",
        "importe-invalido": "Ingresá al menos un importe de juego mayor que cero.",
        "rendicion-con-cobros": "Esta rendición ya tiene cobros registrados. Para no alterar la Caja, primero debe hacerse una reversión compensatoria.",
        "edicion-fallida": "No se pudo corregir la rendición. No se guardaron los cambios.",
        "anulacion-no-confirmada": "Marcá la confirmación para anular la rendición.",
        "anulacion-fallida": "No se pudo anular la rendición. El historial permanece sin cambios.",
        "rendicion-fallida": "No se pudo registrar la rendición.",
        "sorteo-ya-rendido": "Este operador ya tiene una rendición activa para ese sorteo. No se creó un duplicado.",
        "juegos-periodo-invalido": "Uno o más juegos no corresponden al turno seleccionado. No se guardó la rendición.",
        "fecha-sorteo-invalida": "La fecha de la rendición debe coincidir con la jornada operativa. No se guardó el registro.",
        "sorteo-no-programado": "Ese sorteo no está programado para la fecha elegida según el cronograma oficial.",
        "modalidad-sorteo-invalido": "El sorteo elegido no corresponde a la modalidad configurada para este operador. No se guardó la rendición.",
        "agente-no-encontrado": "No encontramos ese subagente o ambulante. Actualizá la página y volvé a intentar.",
        "cierre-diario-antes-de-hora": "El cierre único se habilita después del último sorteo programado de la jornada.",
        "estado-sorteo-fallido": "No se pudo actualizar el estado de ese sorteo.",
        "sorteo-sin-rendicion": "No se encontró una rendición activa de ese sorteo para marcarla como rendida.",
        "estado-diario-fallido": "No se pudo guardar el estado diario. Volvé a intentarlo.",
        "monto-rendido-invalido": "Ingresá un monto rendido mayor que cero para guardar el estado incompleto.",
        "caja-no-configurada": "No se registró la rendición porque no hay una cuenta Caja activa configurada.",
        "cobro-inicial-fallido": "La rendición se guardó, pero el cobro inicial no se pudo registrar. No vuelvas a crearla; revisá la rendición y registrá el cobro pendiente.",
        "jornada-cambio": "La jornada operativa cambió. Actualizá la pantalla y volvé a marcar el estado.",
        "sin-rendicion-para-confirmar": "Primero registrá al menos una rendición de esta jornada para poder confirmarla como completa.",
        "backup-solo-titular": "Solo el titular de la agencia puede enviar respaldos manuales.",
        "backup-configuracion": "Falta configurar RESEND_API_KEY en los secretos de la función de Supabase.",
        "backup-dominio-no-verificado": "Resend no permite enviar a ese destinatario sin verificar un dominio. Durante la prueba, usá el correo titular de Resend; para otros destinatarios, verificá un dominio y configurá RESEND_FROM_EMAIL.",
        "backup-destinatario": "No hay un correo de respaldo configurado para la agencia. Abrí Personal y permisos y guardá el correo del titular.",
        "backup-no-enviado": "El backup sigue guardado, pero el proveedor rechazó el envío. Revisá el correo configurado y la configuración de Resend."
      } as Record<string,string>)[params.error] ?? "La operación no se pudo completar. Verificá permisos y datos."}</p>}
          <div className="stats-grid compact rendition-stats">
            <div className="stat-card"><span>Rendido hoy</span><strong>{money(todayRendido, activeOrganization.currency_code)}</strong><small>{todayRows.length} registros</small></div>
            <div className="stat-card"><span>Cobrado hoy</span><strong>{money(todayCobrado, activeOrganization.currency_code)}</strong><small>cobros registrados</small></div>
            <div className="stat-card"><span>Pendiente hoy</span><strong>{money(todayPendiente, activeOrganization.currency_code)}</strong><small>saldo del día</small></div>
            <div className="stat-card"><span>Agentes activos</span><strong>{activeAgents.length}</strong><small>{activeAgents.filter((agent) => agent.kind === "subagent").length} subagentes · {activeAgents.filter((agent) => agent.kind === "ambulant").length} ambulantes</small></div>
          </div>

          <section className="rendition-agent-selector" aria-label="Elegir subagente o ambulante">
            <div className="rendition-agent-selector-head">
              <h2>Subagentes y ambulantes</h2>
              <span>{filteredActiveAgents.length} activos</span>
            </div>
            <div className="agency-agent-button-list rendition-agent-code-list">
              {filteredActiveAgents.map((agent) => (
                <div key={agent.id} className={"agency-agent-button-row " + (agent.kind === "subagent" ? "agency-subagent" : "agency-ambulant")}>
                  <Link href={"/pagos?agent=" + agent.id} className="agency-agent-code-button"
                    aria-label={"Abrir rendición de " + (agent.kind === "subagent" ? "subagente " : "ambulante ") + agent.code}>
                    {agent.code || "SIN CÓDIGO"}
                  </Link>
                </div>
              ))}
              {!filteredActiveAgents.length && (
                <div className="agency-empty">{searchTerm ? "No hay subagentes ni ambulantes que coincidan con esa búsqueda." : "No hay subagentes ni ambulantes activos."}</div>
              )}
            </div>
          </section>

          <section className="panel rendition-general-history">
            <div className="panel-head">
              <div>
                <h2>Historial diario de rendiciones</h2>
                <p className="muted">Listado por jornada de rendiciones, juegos, tickets, cobros, observaciones y estados guardados. El reinicio del día no borra el historial anterior.</p>
              </div>
              <span className="muted">{historicalRows.length} registros históricos · {(historicalDailyStatusRows ?? []).length + (historicalDrawStatusRows ?? []).length} estados guardados</span>
            </div>
            {historicalDays.length ? (
              <div className="rendition-archive-days">
                {historicalDays.map(({ day, rows: dayRows, dailyStatuses: dayStatuses, drawStatuses: dayDrawStatuses }, dayIndex) => {
                  const activeDayRows = dayRows.filter((row) => row.status !== "void");
                  const total = activeDayRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
                  const received = activeDayRows.reduce((sum, row) => sum + rowTotals(row).received, 0);
                  const pending = activeDayRows.reduce((sum, row) => sum + rowTotals(row).pending, 0);
                  const voidCount = dayRows.filter((row) => row.status === "void").length;
                  const incompleteCount = dayStatuses.filter((status) => status.status === "incomplete").length
                    + dayDrawStatuses.filter((status) => status.status === "incomplete").length;
                  const agentIds = Array.from(new Set([
                    ...dayRows.map((row) => String(row.agent_id)),
                    ...dayStatuses.map((status) => String(status.agent_id)),
                    ...dayDrawStatuses.map((status) => String(status.agent_id)),
                  ]));
                  return (
                    <details className="rendition-archive-day" key={day} open={dayIndex === 0}>
                      <summary>
                        <span><strong>{formatAgencyDate(day)}</strong><small>{dayRows.length} rendiciones · {dayStatuses.length + dayDrawStatuses.length} estados guardados</small></span>
                        <span className="rendition-archive-summary-totals">
                          <strong>Rendido: {money(total, activeOrganization.currency_code)}</strong>
                          <small>Cobrado: {money(received, activeOrganization.currency_code)} · Pendiente: {money(pending, activeOrganization.currency_code)} · {voidCount} anuladas · {incompleteCount} incompletas</small>
                        </span>
                        <span className="rendition-open-label">Ver día ▾</span>
                      </summary>
                      <div className="rendition-archive-agents">
                        {agentIds.map((id) => {
                          const agent = agentRows.find((item) => String(item.id) === id);
                          if (!agent) return null;
                          const agentDayRows = dayRows.filter((row) => String(row.agent_id) === id);
                          const dayStatus = historicalDailyStatusByAgentAndDay.get(day + "|" + id);
                          const agentDrawStatuses = historicalDrawStatusesByAgentAndDay.get(day + "|" + id) ?? [];
                          const statusLabel = dayStatus
                            ? dayStatus.status === "incomplete" ? "Incompleta" : dayStatus.status === "complete" ? "Rendida" : String(dayStatus.status ?? "Guardado")
                            : agentDayRows.length ? "Con rendiciones" : agentDrawStatuses.length ? "Estados por sorteo" : "Guardado";
                          const statusTone = dayStatus?.status === "complete" ? "is-complete" : dayStatus?.status === "incomplete" ? "is-incomplete" : "is-pending";
                          return (
                            <details className="rendition-archive-agent" key={id}>
                              <summary>
                                <span>{agent.kind === "subagent" ? "Subagente" : "Ambulante"}</span><strong>{agent.code} · {agent.full_name}</strong>
                                <small>{agentDayRows.length} rendiciones</small><span className={"rendition-archive-status-badge " + statusTone}>{statusLabel}</span>
                              </summary>
                              <div className="rendition-archive-agent-body">
                                {dayStatus && (
                                  <div className="rendition-archive-status">
                                    <span className={"rendition-archive-status-badge " + (dayStatus.status === "complete" ? "is-complete" : dayStatus.status === "incomplete" ? "is-incomplete" : "is-pending")}>{statusLabel}</span>
                                    {dayStatus.status === "incomplete" && dayStatus.reported_amount !== null && dayStatus.reported_amount !== undefined && Number(dayStatus.reported_amount) > 0 && <span>Monto rendido hasta ese momento: <strong>{money(dayStatus.reported_amount, activeOrganization.currency_code)}</strong></span>}
                                    {dayStatus.notes && <span>Observación: {dayStatus.notes}</span>}
                                    {dayStatus.updated_at && <small>Actualizado: {formatAgencyDateTime(dayStatus.updated_at)}</small>}
                                  </div>
                                )}
                                {agentDrawStatuses.length > 0 && (
                                  <div className="rendition-archive-draw-statuses">
                                    <h4>Estados por sorteo</h4>
                                    <ul>
                                      {agentDrawStatuses.map((status: any, index: number) => (
                                        <li key={String(status.draw_period) + "-" + String(status.updated_at ?? index)}>
                                          <span><strong>{status.draw_period}</strong>{status.updated_at && <small>{formatAgencyDateTime(status.updated_at)}</small>}</span>
                                          <span className={"rendition-archive-status-badge " + (status.status === "complete" ? "is-complete" : status.status === "incomplete" ? "is-incomplete" : "is-pending")}>{status.status === "complete" ? "Rendida" : status.status === "incomplete" ? "Incompleta" : status.status === "review" ? "Revisar" : status.status === "pending" ? "Pendiente" : String(status.status ?? "Guardado")}</span>
                                          {status.reported_amount !== null && status.reported_amount !== undefined && Number(status.reported_amount) > 0 && <strong>Monto informado: {money(status.reported_amount, activeOrganization.currency_code)}</strong>}
                                          {status.notes && <small>Observación: {status.notes}</small>}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {agentDayRows.length ? <RenditionHistory agent={agent} historyRows={agentDayRows} /> : <div className="rendition-archive-empty-message">El estado quedó guardado, pero no hay importes por juego asociados a esa jornada.</div>}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : <p className="muted rendition-archive-empty">Todavía no hay jornadas anteriores guardadas. Al cambiar la jornada operativa, las rendiciones y los estados quedarán listados acá sin borrarse.</p>}
          </section>

          </>
      ) : (
        <div className="rendition-selected-view">
          <div className="rendition-selected-header">
            <Link href="/pagos" className="back-link">← Volver a subagentes y ambulantes</Link>
            <div>
              <p className="eyebrow">RENDICIÓN DEL DÍA</p>
              <h1>{selectedAgent?.code ?? "Operador"}</h1>
            </div>
          </div>
      {params.resultado === "backup-manual-enviado" && <p className="message success-message">Backup manual enviado al correo configurado: {Math.max(0, Number(params.copias ?? 0))} rendición(es). El cierre automático continúa programado.</p>}
      {params.resultado === "backup-sin-pendientes" && <p className="message">No había respaldos pendientes para enviar. Las copias guardadas siguen disponibles en el historial.</p>}
      {params.resultado === "sorteo-rendido" && <p className="message success-message">Se confirmó el estado de ese sorteo; los demás períodos no se modificaron.</p>}
      {params.resultado === "rendicion-creada" && <p className={(params.backup === "enviado" || params.backup === "cierre-diario") ? "message success-message" : "message backup-pending-message"}>Rendición registrada correctamente. {params.backup === "cierre-diario" ? "La copia quedó acumulada para enviarse en un único correo al cierre de la jornada." : params.backup === "enviado" ? "El backup de texto se envió al correo configurado para el titular." : params.backup === "dominio-no-verificado" ? "La rendición y su copia de texto se conservaron, pero Resend bloqueó el envío porque falta verificar un dominio y usarlo en la dirección del remitente. Configurá el dominio en Resend y RESEND_FROM_EMAIL en los secretos de la función de Supabase; después reintentá desde Personal y permisos." : "El respaldo quedó guardado, pero el correo no confirmó la entrega. Revisá el estado en Personal y permisos."}{params.foto === "no-adjunta" ? " La foto no se adjuntó; el respaldo de texto se conserva." : ""}</p>}
      {params.resultado === "rendicion-corregida" && <p className={(params.backup === "enviado" || params.backup === "cierre-diario") ? "message success-message" : "message backup-pending-message"}>Rendición corregida. Se conserva la auditoría y se creó una nueva revisión del respaldo. {params.backup === "cierre-diario" ? "La nueva revisión quedó acumulada para el correo único de cierre diario." : params.backup === "enviado" ? "El correo se envió." : params.backup === "dominio-no-verificado" ? "Resend rechazó el envío porque falta verificar un dominio y usar una dirección remitente de ese dominio. La copia permanece guardada; configurá Resend y reintentá desde Personal y permisos." : "El correo no confirmó entrega; la revisión permanece guardada para reintento."}</p>}
      {params.resultado === "rendicion-anulada" && <p className={(params.backup === "enviado" || params.backup === "cierre-diario") ? "message success-message" : "message backup-pending-message"}>Rendición anulada con historial conservado. {params.backup === "cierre-diario" ? "El respaldo actualizado quedó acumulado para el correo único de cierre diario." : params.backup === "enviado" ? "El respaldo actualizado se envió al correo del titular." : params.backup === "dominio-no-verificado" ? "La rendición anulada y su respaldo siguen registrados, pero Resend requiere verificar un dominio y configurar la dirección remitente antes de enviar. Reintentá después de esa configuración." : "El respaldo quedó registrado, pero el correo no confirmó entrega."}</p>}
      {params.resultado === "estado-rendida" && <p className="message success-message">Estado actualizado: rendición confirmada como completa para esta jornada.</p>}
      {params.resultado === "estado-incompleta" && <p className="message backup-pending-message">Estado actualizado: rendición marcada como incompleta. Podés dejar una observación para recordar qué falta.</p>}
      {params.error === "solo-titular-configuracion" && <p className="message error-message">La configuración es exclusiva del titular de la agencia.</p>}
      {params.error && params.error !== "solo-titular-configuracion" && <p className="message error-message">{({
        "sin-permiso-rendicion": "No tenés permiso para registrar rendiciones.",
        "sin-permiso-cobro": "No tenés permiso para registrar cobros.",
        "sin-permiso-editar": "No tenés permiso para corregir rendiciones.",
        "sin-permiso-anular": "No tenés permiso para anular rendiciones.",
        "rendicion-invalida": "No se identificó la rendición que querés corregir.",
        "fecha-invalida": "La fecha del juego no es válida.",
        "importe-invalido": "Ingresá al menos un importe de juego mayor que cero.",
        "rendicion-con-cobros": "Esta rendición ya tiene cobros registrados. Para no alterar la Caja, primero debe hacerse una reversión compensatoria.",
        "edicion-fallida": "No se pudo corregir la rendición. No se guardaron los cambios.",
        "anulacion-no-confirmada": "Marcá la confirmación para anular la rendición.",
        "anulacion-fallida": "No se pudo anular la rendición. El historial permanece sin cambios.",
        "rendicion-fallida": "No se pudo registrar la rendición.",
        "sorteo-ya-rendido": "Este operador ya tiene una rendición activa para ese sorteo. No se creó un duplicado.",
        "juegos-periodo-invalido": "Uno o más juegos no corresponden al turno seleccionado. No se guardó la rendición.",
        "fecha-sorteo-invalida": "La fecha de la rendición debe coincidir con la jornada operativa. No se guardó el registro.",
        "sorteo-no-programado": "Ese sorteo no está programado para la fecha elegida según el cronograma oficial.",
        "modalidad-sorteo-invalido": "El sorteo elegido no corresponde a la modalidad configurada para este operador. No se guardó la rendición.",
        "agente-no-encontrado": "No encontramos ese subagente o ambulante. Actualizá la página y volvé a intentar.",
        "cierre-diario-antes-de-hora": "El cierre único se habilita después del último sorteo programado de la jornada.",
        "estado-sorteo-fallido": "No se pudo actualizar el estado de ese sorteo.",
        "sorteo-sin-rendicion": "No se encontró una rendición activa de ese sorteo para marcarla como rendida.",
        "estado-diario-fallido": "No se pudo guardar el estado diario. Volvé a intentarlo.",
        "monto-rendido-invalido": "Ingresá un monto rendido mayor que cero para guardar el estado incompleto.",
        "caja-no-configurada": "No se registró la rendición porque no hay una cuenta Caja activa configurada.",
        "cobro-inicial-fallido": "La rendición se guardó, pero el cobro inicial no se pudo registrar. No vuelvas a crearla; revisá la rendición y registrá el cobro pendiente.",
        "jornada-cambio": "La jornada operativa cambió. Actualizá la pantalla y volvé a marcar el estado.",
        "sin-rendicion-para-confirmar": "Primero registrá al menos una rendición de esta jornada para poder confirmarla como completa.",
        "backup-solo-titular": "Solo el titular de la agencia puede enviar respaldos manuales.",
        "backup-configuracion": "Falta configurar RESEND_API_KEY en los secretos de la función de Supabase.",
        "backup-dominio-no-verificado": "Resend no permite enviar a ese destinatario sin verificar un dominio. Durante la prueba, usá el correo titular de Resend; para otros destinatarios, verificá un dominio y configurá RESEND_FROM_EMAIL.",
        "backup-destinatario": "No hay un correo de respaldo configurado para la agencia. Abrí Personal y permisos y guardá el correo del titular.",
        "backup-no-enviado": "El backup sigue guardado, pero el proveedor rechazó el envío. Revisá el correo configurado y la configuración de Resend."
      } as Record<string,string>)[params.error] ?? "La operación no se pudo completar. Verificá permisos y datos."}</p>}
          {selectedAgent ? (
            <AgentAccordion agent={selectedAgent} />
          ) : (
            <div className="message error-message">No encontramos ese subagente o ambulante. Volvé a la lista y seleccioná otro código.</div>
          )}
        </div>
      )}
    </div>
  );
}
