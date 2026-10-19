import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { getOfficialAgencyGame } from "@/lib/agency-official-games";
import { agencyBusinessDateForCutoff, formatAgencyDate, formatAgencyDateTime } from "@/lib/agency-datetime";
import { getAllOfficialDrawPeriods, getOfficialDrawPeriodsForDate, getAgencyLocalClock, getDrawPeriodStatus, getPreferredPendingDrawPeriod } from "@/lib/agency-draw-schedule";
import { DailyBoundaryRefresh } from "@/components/daily-boundary-refresh";
import { RenditionScrollHelper } from "@/components/rendition-scroll-helper";
import { RenditionDeadlineAlert } from "@/components/rendition-deadline-alert";
import { RenditionEntryForm } from "@/components/rendition-entry-form";
import { TicketClosureReceipt } from "@/components/ticket-closure-receipt";
import { PrizePaymentPanel } from "@/components/prize-payment-panel";
import { receiveAgencyRendition, voidAgencyRendition, correctAgencyDailyRenditionAmount, annulAgencyDailyRendition, setAgencyDrawRenditionStatus, setAgencyDailyRenditionStatus, sendAgencyBackupManually } from "../agencias/actions";

type GameAmount = {
  id: string;
  game_type_id: string;
  amount: number | string;
  commission_percent: number | string;
  commission_amount: number | string;
  agency_game_types: { id: string; name: string; category: string } | null;
};

function reportedPrizeTotal(receipt: any): number {
  if (!receipt || typeof receipt !== "object") return 0;
  const tickets = receipt.type === "loteria-corrientes-end-of-day-batch-v1" && Array.isArray(receipt.tickets)
    ? receipt.tickets
    : receipt.type === "loteria-corrientes-end-of-day-v1" ? [receipt] : [];
  return tickets.reduce((sum: number, ticket: any) => {
    const totalAmount = ticket?.totalPrizes?.amount;
    const components = [ticket?.quiniela?.prizesPaid?.amount, ticket?.quinielaAlToque?.prizesPaid?.amount, ticket?.otherGamesPrizes?.amount]
      .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
    const componentsTotal = components.reduce((subtotal: number, value: unknown) => subtotal + Math.max(0, Number(value)), 0);
    if (totalAmount !== null && totalAmount !== undefined && Number.isFinite(Number(totalAmount)) && Number(totalAmount) > 0) {
      return sum + Number(totalAmount);
    }
    return sum + componentsTotal;
  }, 0);
}

export default async function PagosPage({ searchParams }: { searchParams?: Promise<{ agent?: string; busqueda?: string; resultado?: string; error?: string; backup?: string; foto?: string; copias?: string; ticket?: string }> }) {
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
  const { data: recentPrizePaymentRows } = await supabase
    .from("agency_prize_payments")
    .select("id,coupon_number,game_name,prize_amount,payment_date,capture_method,notes,included_in_ticket_ocr")
    .eq("organization_id", activeOrganization.id)
    .order("created_at", { ascending: false })
    .limit(25);
  const recentPrizePayments = (recentPrizePaymentRows ?? []).map((row: any) => ({
    id: String(row.id),
    coupon_number: String(row.coupon_number),
    game_name: row.game_name ? String(row.game_name) : null,
    prize_amount: Number(row.prize_amount),
    payment_date: String(row.payment_date),
    capture_method: String(row.capture_method),
    notes: row.notes ? String(row.notes) : null,
    included_in_ticket_ocr: Boolean(row.included_in_ticket_ocr),
  }));

  const [{ data: operationalSettings }, { data: agents }, { data: gameTypes }, { data: agentCommissions }, { data: commissionDefaults }] = await Promise.all([
    supabase.from("agency_operational_settings").select("rendition_cutoff_time").eq("organization_id", activeOrganization.id).maybeSingle(),
    supabase.from("agency_agents").select("id,kind,full_name,code,is_active,phone,rendition_policy,rendition_periods,rendition_frequency,rendition_weekdays").eq("organization_id", activeOrganization.id).order("kind").order("code"),
    supabase.from("agency_game_types").select("id,name,category,enabled").eq("organization_id", activeOrganization.id).order("sort_order").order("name"),
    supabase.from("agency_agent_game_commissions").select("agent_id,game_type_id,commission_percent").eq("organization_id", activeOrganization.id),
    supabase.from("agency_game_commission_defaults").select("game_type_id,commission_percent").eq("organization_id", activeOrganization.id),
  ]);
  const cutoffTime = String(operationalSettings?.rendition_cutoff_time ?? "00:00").slice(0, 5);
  const today = agencyBusinessDateForCutoff(cutoffTime);
  const { data: todayPrizePaymentRows, error: todayPrizePaymentError } = await supabase
    .from("agency_prize_payments")
    .select("prize_amount,included_in_ticket_ocr")
    .eq("organization_id", activeOrganization.id)
    .eq("payment_date", today);
  if (todayPrizePaymentError) throw new Error("No se pudieron cargar los premios pagados de hoy: " + todayPrizePaymentError.message);
  const todayCashPrizeTotal = (todayPrizePaymentRows ?? []).reduce((sum: number, row: any) =>
    sum + (row.included_in_ticket_ocr ? 0 : Number(row.prize_amount ?? 0)), 0);

  async function loadAllRenditions() {
    const accumulated: any[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("agency_renditions")
        .select("id,agent_id,rendition_date,created_at,updated_at,game_period,draw_number,capture_method,amount_due,net_due,status,reference,notes,ticket_receipt_data,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(id,payment_date,amount,reference),agency_rendition_game_amounts(id,game_type_id,amount,commission_percent,commission_amount,agency_game_types(id,name,category)),agency_rendition_tickets(id,ticket_number,ticket_qr_payload)")
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
  const dailyCloseAllowed = true;

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
  const todayRendidoBruto = todayRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
  const todayTotalNetoAntesDePremios = todayRows.reduce((sum, row) => sum + Number(row.net_due ?? row.amount_due ?? 0), 0);
  const todayOcrPrizeTotal = todayRows.reduce((sum, row) => sum + reportedPrizeTotal(row.ticket_receipt_data), 0);
  const todayPrizeTotal = todayOcrPrizeTotal + todayCashPrizeTotal;
  // Mostrar el saldo negativo también permite detectar premios que superan el neto vendido.
  const todayTotalRendido = todayTotalNetoAntesDePremios - todayPrizeTotal;
  const todayComisiones = todayRows.reduce((sum, row) => sum + (Array.isArray(row.agency_rendition_game_amounts) ? row.agency_rendition_game_amounts : []).reduce((subtotal: number, game: any) => subtotal + Number(game.commission_amount ?? 0), 0), 0);
  // Pending is based on net cash due after commission, not gross sales minus cash received.
  const todayPendiente = todayRows.reduce((sum, row) => {
    const due = Number(row.net_due ?? row.amount_due ?? 0);
    const paid = (Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : []).reduce((subtotal: number, payment: any) => subtotal + Number(payment.amount ?? 0), 0);
    return sum + Math.max(0, due - paid);
  }, 0);
  const ticketGameOrder = new Map([
    "Quiniela Correntina", "Quiniela Al Toque", "Loto Plus", "Quini 6",
    "Pozo Quiniela", "Brinco", "Loto 5 Plus", "Lotería Online",
    "Quiniela Poceada Correntina", "Telekino",
  ].map((name, index) => [name.toLocaleLowerCase("es-AR"), index] as const));
  const allGames = (gameTypes ?? [])
    .filter((game) => Boolean(getOfficialAgencyGame(game.name)))
    .sort((left, right) =>
      (ticketGameOrder.get(left.name.toLocaleLowerCase("es-AR")) ?? 999) -
      (ticketGameOrder.get(right.name.toLocaleLowerCase("es-AR")) ?? 999)
      || left.name.localeCompare(right.name, "es-AR")
    )
    .map((game) => ({ id: game.id, name: game.name, category: game.category, enabled: game.enabled }));
  const games = allGames.filter((game) => game.enabled).map(({ id, name, category }) => ({ id, name, category }));
  const defaultCommissionByGame = new Map((commissionDefaults ?? []).map((row: any) => [String(row.game_type_id), Number(row.commission_percent)]));
  const agentCommissionByGame = new Map((agentCommissions ?? []).map((row: any) => [
    String(row.agent_id) + "|" + String(row.game_type_id),
    Number(row.commission_percent),
  ]));
  function gamesForAgent(agentId: string, includeDisabled = false) {
    const source = includeDisabled ? allGames : games;
    return source.map((game) => {
      const key = agentId + "|" + game.id;
      const rate = agentCommissionByGame.has(key)
        ? agentCommissionByGame.get(key)!
        : defaultCommissionByGame.has(game.id) ? defaultCommissionByGame.get(game.id)! : null;
      return { ...game, commissionPercent: rate };
    });
  }
  const agentLabel = (agent: any) => agent.kind === "subagent" ? "Subagente" : "Ambulante";
  const rowTotals = (row: any) => {
    const payments = Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : [];
    const received = payments.reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);
    const cashDue = Number(row.net_due ?? row.amount_due ?? 0);
    return { received, pending: Math.max(0, cashDue - received), payments };
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
  const closeAlertTime = String(lastScheduledDraw?.time ?? cutoffTime).slice(0, 5);
  const pendingBeforeCloseAgents = activeAgents.filter((agent: any) => {
    const policy = String(agent.rendition_policy ?? "daily");
    if (policy === "daily") {
      const dailyRendition = todayRows.find((row: any) =>
        String(row.agent_id) === String(agent.id) &&
        String(row.game_period ?? "").trim() === "Cierre diario" &&
        row.status !== "void"
      );
      const dailyStatus = dailyStatusByAgent.get(String(agent.id)) as any;
      return !dailyRendition || dailyStatus?.status !== "complete";
    }
    const configuredPeriods = Array.isArray(agent.rendition_periods) ? agent.rendition_periods.map(String) : [];
    return drawPeriods.some((period) => {
      if (!period.time || period.time > closeAlertTime) return false;
      if (policy === "selected_draws" && !configuredPeriods.includes(period.label)) return false;
      const state = drawPeriodStateForAgent(String(agent.id), period);
      return state.status === "pending" || state.status === "incomplete";
    });
  }).map((agent: any) => ({
    id: String(agent.id),
    code: String(agent.code ?? ""),
    fullName: String(agent.full_name ?? ""),
    kind: agent.kind === "subagent" ? "subagent" as const : "ambulant" as const,
  }));
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
          const isDailyClosure = String(row.game_period ?? "").trim().toLocaleLowerCase("es-AR") === "cierre diario";
          return (
            <details className="rendition-record" key={row.id}>
              <summary>
                <span className="rendition-record-date">{formatAgencyDate(row.rendition_date)}<small>{formatAgencyDateTime(row.created_at)}</small></span>
                <span className="rendition-record-agent-code" aria-label={"Código del operador " + agent.code} title={"Código del operador " + agent.code}>{agent.code}</span>
                <span className="rendition-record-period">{row.game_period || "Período no identificado"}{row.draw_number ? <small>Sorteo {row.draw_number}</small> : null}</span>
                <span className="rendition-record-amount">{money(isDailyClosure ? (row.net_due ?? row.amount_due) : row.amount_due, activeOrganization.currency_code)}<small>{isDailyClosure ? "Importe final del cierre diario" : "Ventas brutas"} · {row.capture_method === "manual" ? "Carga manual" : row.capture_method === "qr" ? "Foto / QR" : "Foto del ticket"}</small><small className="commission-note">{isDailyClosure ? "Ventas brutas: " : "Neto a rendir: "}{money(isDailyClosure ? row.amount_due : (row.net_due ?? row.amount_due), activeOrganization.currency_code)}</small></span>
                <span className={row.status === "void" ? "badge" : totals.pending <= 0 ? "badge success" : "badge"}>{row.status === "void" ? "Anulada" : totals.pending <= 0 ? (isDailyClosure ? "Rendida" : "Cobrada") : "Pendiente " + money(totals.pending, activeOrganization.currency_code)}</span>
              </summary>
              <div className="rendition-record-detail">
                <div className="rendition-detail-columns">
                  <div>
                    <h4>Detalle por juego</h4>
                    {gameAmounts.length ? <ul className="rendition-game-amounts">{gameAmounts.map((game) => <li key={game.id}><span>{game.agency_game_types?.name ?? "Juego"}<small className="commission-note">{Number(game.commission_percent ?? 0).toFixed(2)}% comisión · {money(game.commission_amount ?? 0, activeOrganization.currency_code)}</small></span><strong>{money(game.amount, activeOrganization.currency_code)}<small className="commission-note">neto {money(Number(game.amount) - Number(game.commission_amount ?? 0), activeOrganization.currency_code)}</small></strong></li>)}</ul> : <p className="muted">No hay juegos asociados.</p>}
                    <p className="rendition-grand-total"><span>Ventas brutas</span><strong>{money(row.amount_due, activeOrganization.currency_code)}</strong></p>
                    <p className="rendition-grand-total"><span>Efectivo neto a rendir</span><strong>{money(row.net_due ?? Math.max(0, Number(row.amount_due ?? 0) - gameAmounts.reduce((sum: number, game: any) => sum + Number(game.commission_amount ?? 0), 0)), activeOrganization.currency_code)}</strong></p>
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
                {row.ticket_receipt_data?.type === "loteria-corrientes-end-of-day-v1" && <TicketClosureReceipt data={row.ticket_receipt_data} />}
                {row.ticket_receipt_data?.type === "loteria-corrientes-end-of-day-batch-v1" && Array.isArray(row.ticket_receipt_data.tickets) && (
                  <section className="weekly-ticket-receipt-history">
                    <strong>Comprobantes oficiales leídos y guardados en esta rendición ({row.ticket_receipt_data.tickets.length})</strong>
                    {row.ticket_receipt_data.tickets.map((ticket: any, index: number) => <details open key={String(ticket.periodNumber ?? "sin-periodo") + "-" + index}>
                      <summary>Cupón {index + 1} · Período {ticket.periodNumber || "no detectado"} · {ticket.closedAt?.date ?? ticket.printedAt?.date ?? ticket.openedAt?.date ?? "Fecha no detectada"}</summary>
                      <TicketClosureReceipt data={ticket} />
                    </details>)}
                  </section>
                )}
                {isDailyClosure && row.status !== "void" && row.ticket_receipt_data?.type !== "loteria-corrientes-end-of-day-v1" && row.ticket_receipt_data?.type !== "loteria-corrientes-end-of-day-batch-v1" && (canCreateRenditions || canEditRenditions) && (
                  <details className="rendition-edit-details">
                    <summary>Recuperar detalle OCR del ticket</summary>
                    <p className="muted small-text">La rendición financiera ya existe. Volvé a seleccionar la foto del FIN DE JORNADA para adjuntar únicamente su detalle OCR. Esta acción no cambia ventas, importes, cobros ni movimientos de Caja.</p>
                    <RenditionEntryForm
                      agentId={String(agent.id)}
                      games={gamesForAgent(String(agent.id))}
                      today={today}
                      periods={[dailyClosurePeriod]}
                      allPeriods={allOfficialDrawPeriods}
                      defaultPeriod="Cierre diario"
                      dailyMode
                      receiptOnlyMode
                      initialRendition={{
                        id: String(row.id),
                        renditionDate: String(row.rendition_date),
                        period: "Cierre diario",
                        drawNumber: String(row.draw_number ?? ""),
                        amounts: Object.fromEntries(gameAmounts.map((game) => [String(game.game_type_id), Number(game.amount).toFixed(2)])),
                        ticketNumbers: tickets.map((ticket: any) => String(ticket.ticket_number ?? "")).filter(Boolean),
                        qrPayload: tickets.find((ticket: any) => ticket.ticket_qr_payload)?.ticket_qr_payload ?? "",
                        reference: String(row.reference ?? ""),
                        notes: String(row.notes ?? ""),
                        captureMethod: "photo",
                        receiptData: null,
                      }}
                    />
                  </details>
                )}
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
                {row.status !== "void" && totals.pending > 0 && !canRegisterPayments && <p className="muted small-text">No tenés permiso para registrar cobros. El titular debe habilitar esta operación.</p>}
                {canEditRenditions && totals.received <= 0 && row.status === "open" && String(row.game_period ?? "").trim() && getOfficialDrawPeriodsForDate(String(row.rendition_date)).some((period) => period.label === row.game_period) && (
                  <details className="rendition-edit-details">
                    <summary>Modificar rendición</summary>
                    <div className="rendition-correction-panel">
                      <p className="muted small-text">Los cambios guardan una revisión nueva y conservan el registro en auditoría. Solo se permite editar antes de registrar cobros.</p>
                      <RenditionEntryForm
                        agentId={agent.id}
                        games={gamesForAgent(String(agent.id), true)}
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
                          receiptData: row.ticket_receipt_data ?? null,
                        }}
                      />
                    </div>
                  </details>
                )}
                {canEditRenditions && isDailyClosure && row.status === "closed" && (
                  <details className="rendition-edit-details">
                    <summary>Corregir importe neto del cierre diario</summary>
                    <div className="rendition-correction-panel">
                      <p className="muted small-text">La corrección actualiza el importe neto y los movimientos existentes de Caja en una sola operación. No registra un segundo cobro y deja constancia en la auditoría.</p>
                      <form action={correctAgencyDailyRenditionAmount} className="agency-pay-form">
                        <input type="hidden" name="rendition_id" value={row.id} />
                        <input type="hidden" name="agent_id" value={agent.id} />
                        <label>Nuevo importe neto a rendir
                          <input type="number" name="new_net_amount" min="0.01" max="999999999999.99" step="0.01" defaultValue={Number(row.net_due ?? row.amount_due).toFixed(2)} required />
                        </label>
                        <label>Motivo de la corrección
                          <textarea name="reason" rows={2} maxLength={1000} placeholder="Ej.: corrección del importe final del cierre" required />
                        </label>
                        <label><input type="checkbox" name="confirm_correction" value="yes" required /> Confirmo corregir este importe y sincronizar los movimientos existentes de Caja</label>
                        <button className="button primary small" type="submit">Guardar importe corregido</button>
                      </form>
                    </div>
                  </details>
                )}
                {canEditRenditions && totals.received > 0 && !isDailyClosure && <p className="message">Esta rendición tiene cobros registrados; no puede editarse hasta resolver esos movimientos de Caja.</p>}
                {canEditRenditions && totals.received <= 0 && row.status === "open" && (!String(row.game_period ?? "").trim() || !getOfficialDrawPeriodsForDate(String(row.rendition_date)).some((period) => period.label === row.game_period)) && <p className="message">Esta rendición histórica no tiene un período oficial identificable. Se conserva y no se reasigna automáticamente.</p>}
                {canDeleteRenditions && isDailyClosure && row.status !== "void" && (
                  <details className="rendition-void-details">
                    <summary>Anular cierre diario y revertir Caja</summary>
                    <p className="muted small-text">El cierre se marca como anulado sin borrar la rendición ni sus cobros originales. Si ya hubo cobros, se registran salidas compensatorias en Caja para conservar el historial contable.</p>
                    <form action={annulAgencyDailyRendition} className="rendition-void-form">
                      <input type="hidden" name="rendition_id" value={row.id} />
                      <input type="hidden" name="agent_id" value={agent.id} />
                      <label>Motivo de anulación<textarea name="reason" rows={2} maxLength={1000} placeholder="Ej.: cierre cargado al operador equivocado" required /></label>
                      <label><input type="checkbox" name="confirm_void" value="yes" required /> Confirmo anular el cierre diario y conservar el historial</label>
                      <button className="button danger small" type="submit">Anular cierre diario</button>
                    </form>
                  </details>
                )}
                {canDeleteRenditions && !isDailyClosure && totals.received <= 0 && row.status === "open" && (
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
    const renditionFrequency = String((agent as any).rendition_frequency ?? "daily");
    const renditionWeekdays = Array.isArray((agent as any).rendition_weekdays) ? (agent as any).rendition_weekdays.map(String) : ["mon","tue","wed","thu","fri","sat"];
    const weekdayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
    const isScheduledRenditionDay = renditionFrequency !== "weekly" || renditionWeekdays.includes(weekdayKeys[new Date(today + "T00:00:00.000Z").getUTCDay()]);
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
            <div><span className="eyebrow">{renditionFrequency === "weekly" ? "RENDICIÓN ACUMULADA" : renditionPolicy === "daily" ? "RENDICIÓN DEL DÍA" : renditionPolicy === "selected_draws" ? "SORTEOS SELECCIONADOS" : "RENDICIONES POR SORTEO"}</span><h3>{agentLabel(agent)} {agent.code} · {agent.full_name}</h3>{renditionPolicy === "daily" && <p className={"daily-review-inline status-" + dailyStatusKind}><strong>Revisión del día operativo:</strong> {dailyStatusLabel}</p>}<p className="muted">{renditionFrequency === "weekly" ? "Acumula cupones oficiales de FIN DE JORNADA y registra una sola entrega en Caja el día habilitado." : renditionPolicy === "daily" ? "Una sola rendición reúne los importes de todos los juegos del día." : renditionPolicy === "selected_draws" ? "Solo se controlan los sorteos habilitados para este operador." : "Cada sorteo tiene su rendición independiente."} Comisión acumulada: <strong>{money(commission, activeOrganization.currency_code)}</strong> · Neto estimado: <strong>{money(netDue, activeOrganization.currency_code)}</strong>.</p></div>
            <Link href={"/agencias/" + agent.id} className="button ghost">Configurar</Link>
          </div>
          {renditionPolicy !== "daily" && <div className="draw-period-chip-list expanded-draw-period-list" aria-label={"Estados de rendición de " + agent.code}>
            {agentPeriodStates.map((entry) => <span key={entry.period.label} className={"draw-period-chip status-" + entry.status} title={entry.description}>{entry.label}</span>)}
          </div>}
          {canCreateRenditions && incompleteDraws.length > 0 && <div className="draw-period-status-actions">
            {incompleteDraws.map((entry) => <form key={entry.period.label} action={setAgencyDrawRenditionStatus}>
              <input type="hidden" name="agent_id" value={agent.id} />
              <input type="hidden" name="operational_date" value={today} />
              <input type="hidden" name="draw_period" value={entry.period.label} />
              <input type="hidden" name="status" value="complete" />
              <button className="button ghost" type="submit">Confirmar {entry.period.shortLabel} como rendida</button>
            </form>)}
          </div>}
          {canCreateRenditions
            ? renditionPolicy === "daily"
              ? dailyRendition
                ? dailyStatusKind === "incomplete" && canEditRenditions && dailyRendition.status === "open"
                  ? <>
                      <p className="message">Rendición incompleta: podés corregir los importes de los juegos. Los cobros ya registrados se conservan y el total no puede quedar por debajo de lo cobrado.</p>
                      <RenditionEntryForm
                        agentId={agent.id}
                        games={gamesForAgent(String(agent.id))}
                        today={today}
                        periods={[dailyClosurePeriod]}
                        allPeriods={allOfficialDrawPeriods}
                        defaultPeriod="Cierre diario"
                        dailyMode
                        initialRendition={{
                          id: String(dailyRendition.id),
                          renditionDate: String(dailyRendition.rendition_date),
                          period: String(dailyRendition.game_period ?? "Cierre diario"),
                          drawNumber: String(dailyRendition.draw_number ?? ""),
                          amounts: Object.fromEntries(((dailyRendition.agency_rendition_game_amounts ?? []) as GameAmount[]).map((item) => [String(item.game_type_id), String(item.amount)])),
                          ticketNumbers: (dailyRendition.agency_rendition_tickets ?? []).map((ticket: any) => String(ticket.ticket_number ?? "")).filter(Boolean),
                          qrPayload: (dailyRendition.agency_rendition_tickets ?? []).find((ticket: any) => ticket.ticket_qr_payload)?.ticket_qr_payload ?? "",
                          reference: String(dailyRendition.reference ?? ""),
                          notes: String(dailyRendition.notes ?? ""),
                          captureMethod: String(dailyRendition.capture_method ?? "manual"),
                          receiptData: dailyRendition.ticket_receipt_data ?? null,
                        }}
                      />
                    </>
                  : <p className="message">La rendición del día ya está registrada. {dailyStatusKind === "complete" ? "El cierre está confirmado." : "Revisá el historial y los cobros registrados."}</p>
                : renditionFrequency === "weekly" && !isScheduledRenditionDay
                  ? <p className="message">Este operador no tiene rendición habilitada hoy. Días configurados: {renditionWeekdays.map((day: string) => ({mon:"lunes",tue:"martes",wed:"miércoles",thu:"jueves",fri:"viernes",sat:"sábado",sun:"domingo"} as Record<string,string>)[day]).filter(Boolean).join(", ")}.</p>
                  : <>
                    <RenditionEntryForm agentId={agent.id} games={gamesForAgent(String(agent.id))} today={today} periods={[dailyClosurePeriod]} allPeriods={allOfficialDrawPeriods} defaultPeriod="Cierre diario" dailyMode dailyCloseAllowed={dailyCloseAllowed} batchMode={renditionFrequency === "weekly"} />
                  </>
              : formPeriods.length > 0
                ? <RenditionEntryForm agentId={agent.id} games={gamesForAgent(String(agent.id))} today={today} periods={formPeriods} allPeriods={allOfficialDrawPeriods} defaultPeriod={defaultPeriod} />
                : <p className="message">No hay otro sorteo habilitado vencido pendiente para registrar. Los turnos futuros se habilitan cuando llega su horario.</p>
            : <p className="message">No tenés permiso para registrar rendiciones. El titular debe habilitar esta operación.</p>}
          <section className="rendition-agent-history">
            <div className="panel-head"><div><h3>Rendiciones del día operativo</h3><p className="muted">{renditionFrequency === "weekly" ? "Cada lote conserva el detalle de cada cupón por fecha; Caja registra una sola entrega por el total del lote." : renditionPolicy === "daily" ? "Una sola rendición reúne todos los juegos de la jornada; el historial conserva los importes registrados." : "Los períodos anteriores quedan en el historial; cada sorteo habilitado se registra por separado."}</p></div><span className="muted">{todayAgentRows.length} registros</span></div>
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
      <div className="stats-grid compact rendition-stats">
        <div className="stat-card rendition-total-card"><span>TOTAL RENDIDO</span><strong>{money(todayTotalRendido, activeOrganization.currency_code)}</strong><small>neto después de comisiones y premios · premios descontados: {money(todayPrizeTotal, activeOrganization.currency_code)}</small></div>
        <div className="stat-card"><span>Ventas brutas</span><strong>{money(todayRendidoBruto, activeOrganization.currency_code)}</strong><small>{todayRows.length} registros · antes de comisiones y premios</small></div>
        <div className="stat-card"><span>Comisiones rendidas</span><strong>{money(todayComisiones, activeOrganization.currency_code)}</strong><small>comisiones reconocidas en las rendiciones del día</small></div>
        <div className="stat-card"><span>Premios pagados</span><strong>{money(todayPrizeTotal, activeOrganization.currency_code)}</strong><small>OCR: {money(todayOcrPrizeTotal, activeOrganization.currency_code)} · Caja fuera de OCR: {money(todayCashPrizeTotal, activeOrganization.currency_code)}</small></div>
        <div className="stat-card"><span>Pendiente hoy</span><strong>{money(todayPendiente, activeOrganization.currency_code)}</strong><small>efectivo neto pendiente después de comisión</small></div>
      </div>
      {params.ticket === "guardado" && (
        <div className="ticket-save-success">
          <p className="message success-message" role="status">Se guardó el detalle completo del ticket de fin de jornada junto con la rendición.</p>
          <Link className="button primary ticket-save-return" href="/pagos#rendiciones">Volver a rendiciones</Link>
        </div>
      )}
      {params.ticket === "error" && <p className="message error-message">La rendición financiera ya se guardó, pero el detalle OCR del ticket no pudo adjuntarse. No vuelvas a registrar la rendición para corregir esto; abrí el registro existente.</p>}
      {params.error === "dia-rendicion-no-habilitado" && <p className="message error-message">Hoy no es un día habilitado para la rendición acumulada de este operador. Revisá su frecuencia en la ficha del subagente o ambulante.</p>}
      {params.error === "lote-cupones-obligatorio" && <p className="message error-message">Para esta modalidad tenés que cargar entre 1 y 12 cupones oficiales de FIN DE JORNADA.</p>}
      {params.error === "lote-cupon-duplicado" && <p className="message error-message">El lote contiene un cupón repetido. No se registró esta rendición.</p>}
      {params.error === "lote-cupon-datos-incompletos" && <p className="message error-message">No se pudo identificar el Período N.º de 7 dígitos y la fecha de uno de los cupones. Corregí el OCR antes de confirmar.</p>}
      {params.error === "lote-fecha-invalida" && <p className="message error-message">Uno de los cupones tiene una fecha inválida o posterior al día de rendición. No se registró el lote.</p>}
      {params.error === "lote-verificacion-fallida" && <p className="message error-message">No se pudo verificar el historial de cupones para evitar duplicados. No se registró esta rendición; volvé a intentar.</p>}
      {params.error === "lote-cupon-ya-rendido" && <p className="message error-message">Uno o más cupones de este lote ya figuran en una rendición anterior de este operador. No se volvió a contabilizar.</p>}
      {params.resultado === "ticket-ocr-adjuntado" && <p className="message success-message">Detalle OCR adjuntado al cierre diario existente. No se modificaron importes ni movimientos de Caja.</p>}
      {params.resultado === "premio-pagado" && <p className="message success-message" role="status">Premio registrado y salida de Caja contabilizada. El cupón quedó marcado como pagado y no puede volver a descontarse.</p>}
      {params.resultado === "premio-corregido" && <p className="message success-message" role="status">Pago de premio corregido. El importe y la fecha del movimiento asociado de Caja se actualizaron juntos.</p>}
      {params.resultado === "premio-eliminado" && <p className="message success-message" role="status">Pago de premio y movimiento asociado de Caja eliminados juntos; la corrección quedó auditada.</p>}
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
      {params.resultado === "cierre-diario-corregido" && <p className="message success-message">Importe neto corregido. Los movimientos existentes de Caja quedaron sincronizados en la misma operación; no se creó un cobro duplicado y se conservó la auditoría.</p>}
      {params.resultado === "cierre-diario-anulado" && <p className="message success-message">Cierre diario anulado. Se conservaron la rendición y los cobros originales; los importes cobrados se compensaron con salidas en Caja y quedó registrada la auditoría.</p>}
      {params.resultado === "estado-rendida" && <p className="message success-message">Estado actualizado: rendición confirmada como completa para esta jornada.</p>}
      {params.resultado === "estado-incompleta" && <p className="message backup-pending-message">Estado actualizado: rendición marcada como incompleta. Podés dejar una observación para recordar qué falta.</p>}
      {params.error === "solo-titular-configuracion" && <p className="message error-message">La configuración es exclusiva del titular de la agencia.</p>}
      {params.error && params.error !== "solo-titular-configuracion" && <p className="message error-message">{({
        "sin-permiso-rendicion": "No tenés permiso para registrar rendiciones.",
        "sin-permiso-ticket-ocr": "No tenés permiso para adjuntar el detalle OCR. Solicitá permiso para crear o editar rendiciones.",
        "ticket-ocr-no-validado": "Revisá la lectura del ticket oficial de FIN DE JORNADA y confirmá que el detalle es correcto.",
        "ticket-ocr-adjunto-fallido": "No se pudo adjuntar el OCR al cierre existente. No se modificaron importes ni Caja; volvé a seleccionar y revisar la foto del ticket.",
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
        "cierre-diario-importe-invalido": "Ingresá un importe neto mayor que cero y un motivo para corregir el cierre diario.",
        "cierre-diario-correccion-fallida": "No se pudo corregir el cierre diario. No se guardaron cambios ni se agregaron cobros.",
        "cierre-diario-caja-inconsistente": "No se pudo corregir porque la Caja y los cobros vinculados no coinciden. No se modificó ningún registro.",
        "cierre-diario-no-se-puede-corregir": "Este cierre no se puede corregir de esa forma. Revisá que esté confirmado y que sus cobros estén vinculados a Caja.",
        "cierre-diario-anulacion-fallida": "No se pudo anular el cierre diario. No se borraron rendiciones ni cobros.",
        "cierre-diario-anulacion-confirmacion": "Marcá la confirmación y escribí el motivo para anular el cierre diario.",
        "rendicion-fallida": "No se pudo registrar la rendición. La operación fue rechazada por la base de datos; no vuelvas a crear registros duplicados. Revisá la información del ticket e intentá una vez más.",
        "agencia-identidad-no-configurada": "La agencia no tiene un número oficial válido. Configurá sus 3 dígitos en Configuración → Datos de la agencia antes de registrar rendiciones.",
        "agente-codigo-ajeno": "El código de este subagente o ambulante no coincide con el número oficial de la agencia. No se guardó la rendición; corregí el dato antes de seguir.",
        "ticket-agencia-ajena": "El ticket indica otro número de agencia. No se aceptó para evitar mezclar rendiciones entre titulares. Verificá el número de agencia y volvé a leer el comprobante.",
        "ticket-subagente-ajeno": "El subagente o ambulante impreso en el ticket no coincide con el operador seleccionado. No se guardó la rendición.",
        "ticket-identificacion-no-verificada": "No se pudo verificar la agencia del ticket en la base de datos. No se guardó; revisá el número del comprobante.",
        "premio-duplicado": "Ese cupón ya tiene un premio pagado registrado en esta agencia. No se descontó de Caja una segunda vez.",
        "premio-cupon-invalido": "Ingresá un número de cupón válido.",
        "premio-importe-invalido": "Ingresá un importe de premio mayor que cero.",
        "premio-foto-invalida": "La foto del cupón debe ser JPG, PNG o WebP y no superar 5 MB.",
        "premio-foto-fallida": "No se pudo guardar la foto del cupón. No se registró el pago de premio.",
        "premio-registro-fallido": "No se pudo registrar el pago de premio. No se descontó de Caja; revisá los datos antes de volver a intentarlo.",
        "premio-no-encontrado": "No se encontró el pago de premio que intentás corregir.",
        "premio-fecha-invalida": "Ingresá una fecha de pago válida.",
        "premio-movimiento-inconsistente": "No se pudo cambiar este pago porque su movimiento vinculado de Caja no coincide. No se modificó ningún dato.",
        "premio-actualizacion-fallida": "No se pudo corregir el pago de premio. No se modificó el movimiento de Caja.",
        "premio-eliminacion-fallida": "No se pudo eliminar el pago de premio. No se modificó el movimiento de Caja.",
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


          <RenditionDeadlineAlert closeTime={closeAlertTime} agents={pendingBeforeCloseAgents} />

          <section id="rendiciones" className="rendition-agent-selector" aria-label="Elegir subagente o ambulante">
            <div className="rendition-agent-selector-head">
              <h2>Subagentes y ambulantes</h2>
              <span>{filteredActiveAgents.length} activos</span>
            </div>
            <div className="agency-agent-button-list rendition-agent-code-list">
              {filteredActiveAgents.map((agent) => (
                <div key={agent.id} className={"agency-agent-button-row " + (agent.kind === "subagent" ? "agency-subagent" : "agency-ambulant")}>
                  <Link href={"/pagos?agent=" + agent.id} className={"agency-agent-code-button" + (String(agent.id) === selectedAgentId ? " is-selected" : "")}
                    aria-current={String(agent.id) === selectedAgentId ? "page" : undefined}
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
                            <div className="rendition-archive-agent" key={id}>
                              <div className="rendition-archive-agent-head">
                                <span>{agent.kind === "subagent" ? "Subagente" : "Ambulante"}</span><strong>{agent.code} · {agent.full_name}</strong>
                                <small>{agentDayRows.length} rendiciones</small><span className={"rendition-archive-status-badge " + statusTone}>{statusLabel}</span>
                              </div>
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
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            ) : <p className="muted rendition-archive-empty">Todavía no hay jornadas anteriores guardadas. Al cambiar la jornada operativa, las rendiciones y los estados quedarán listados acá sin borrarse.</p>}
          </section>

          <PrizePaymentPanel canRegisterPayments={canRegisterPayments} currencyCode={activeOrganization.currency_code} returnAgentId={selectedAgentId} recentPayments={recentPrizePayments} />
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
      {params.resultado === "cierre-diario-corregido" && <p className="message success-message">Importe neto corregido. Los movimientos existentes de Caja quedaron sincronizados en la misma operación; no se creó un cobro duplicado y se conservó la auditoría.</p>}
      {params.resultado === "cierre-diario-anulado" && <p className="message success-message">Cierre diario anulado. Se conservaron la rendición y los cobros originales; los importes cobrados se compensaron con salidas en Caja y quedó registrada la auditoría.</p>}
      {params.resultado === "estado-rendida" && <p className="message success-message">Estado actualizado: rendición confirmada como completa para esta jornada.</p>}
      {params.resultado === "estado-incompleta" && <p className="message backup-pending-message">Estado actualizado: rendición marcada como incompleta. Podés dejar una observación para recordar qué falta.</p>}
      {params.error === "solo-titular-configuracion" && <p className="message error-message">La configuración es exclusiva del titular de la agencia.</p>}
      {params.error && params.error !== "solo-titular-configuracion" && <p className="message error-message">{({
        "sin-permiso-rendicion": "No tenés permiso para registrar rendiciones.",
        "sin-permiso-ticket-ocr": "No tenés permiso para adjuntar el detalle OCR. Solicitá permiso para crear o editar rendiciones.",
        "ticket-ocr-no-validado": "Revisá la lectura del ticket oficial de FIN DE JORNADA y confirmá que el detalle es correcto.",
        "ticket-ocr-adjunto-fallido": "No se pudo adjuntar el OCR al cierre existente. No se modificaron importes ni Caja; volvé a seleccionar y revisar la foto del ticket.",
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
        "cierre-diario-importe-invalido": "Ingresá un importe neto mayor que cero y un motivo para corregir el cierre diario.",
        "cierre-diario-correccion-fallida": "No se pudo corregir el cierre diario. No se guardaron cambios ni se agregaron cobros.",
        "cierre-diario-caja-inconsistente": "No se pudo corregir porque la Caja y los cobros vinculados no coinciden. No se modificó ningún registro.",
        "cierre-diario-no-se-puede-corregir": "Este cierre no se puede corregir de esa forma. Revisá que esté confirmado y que sus cobros estén vinculados a Caja.",
        "cierre-diario-anulacion-fallida": "No se pudo anular el cierre diario. No se borraron rendiciones ni cobros.",
        "cierre-diario-anulacion-confirmacion": "Marcá la confirmación y escribí el motivo para anular el cierre diario.",
        "rendicion-fallida": "No se pudo registrar la rendición. La operación fue rechazada por la base de datos; no vuelvas a crear registros duplicados. Revisá la información del ticket e intentá una vez más.",
        "agencia-identidad-no-configurada": "La agencia no tiene un número oficial válido. Configurá sus 3 dígitos en Configuración → Datos de la agencia antes de registrar rendiciones.",
        "agente-codigo-ajeno": "El código de este subagente o ambulante no coincide con el número oficial de la agencia. No se guardó la rendición; corregí el dato antes de seguir.",
        "ticket-agencia-ajena": "El ticket indica otro número de agencia. No se aceptó para evitar mezclar rendiciones entre titulares. Verificá el número de agencia y volvé a leer el comprobante.",
        "ticket-subagente-ajeno": "El subagente o ambulante impreso en el ticket no coincide con el operador seleccionado. No se guardó la rendición.",
        "ticket-identificacion-no-verificada": "No se pudo verificar la agencia del ticket en la base de datos. No se guardó; revisá el número del comprobante.",
        "premio-duplicado": "Ese cupón ya tiene un premio pagado registrado en esta agencia. No se descontó de Caja una segunda vez.",
        "premio-cupon-invalido": "Ingresá un número de cupón válido.",
        "premio-importe-invalido": "Ingresá un importe de premio mayor que cero.",
        "premio-foto-invalida": "La foto del cupón debe ser JPG, PNG o WebP y no superar 5 MB.",
        "premio-foto-fallida": "No se pudo guardar la foto del cupón. No se registró el pago de premio.",
        "premio-registro-fallido": "No se pudo registrar el pago de premio. No se descontó de Caja; revisá los datos antes de volver a intentarlo.",
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
          <PrizePaymentPanel canRegisterPayments={canRegisterPayments} currencyCode={activeOrganization.currency_code} returnAgentId={selectedAgentId} recentPayments={recentPrizePayments} />
        </div>
      )}
    </div>
  );
}
