import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentContext, money } from "@/lib/accounting";
import { agencyBusinessDateForCutoff, formatAgencyDateTime } from "@/lib/agency-datetime";
import { getAllOfficialDrawPeriods, getOfficialDrawPeriodsForDate, drawPeriodHasPassed, getPreferredPendingDrawPeriod, getUnmappedOfficialGameNames, OFFICIAL_QUINIELA_SCHEDULE_URL, OFFICIAL_EXTRACTS_SCHEDULE_URL } from "@/lib/agency-draw-schedule";
import { RenditionEntryForm } from "@/components/rendition-entry-form";
import { DailyBoundaryRefresh } from "@/components/daily-boundary-refresh";
import { receiveAgencyRendition, saveAgentGameCommissions } from "../actions";

export default async function AgencyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ error?: string; resultado?: string }> }) {
  const { id } = await params;
  const pageParams = searchParams ? await searchParams : {};
  const { supabase, organization, member } = await getCurrentContext();
  if (!organization || !member) return null;
  const isOwner = member.role === "owner";

  const [{ data: agent }, { data: renditions }, { data: gameTypes }, { data: commissionRows }, { data: defaultCommissionRows }, { data: operationalSettings }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,code,full_name,dni,email,phone,whatsapp,address,notes,is_active,created_at").eq("id", id).eq("organization_id", organization.id).maybeSingle(),
    supabase.from("agency_renditions").select("id,rendition_date,created_at,game_period,draw_number,capture_method,period_start,period_end,amount_due,status,reference,notes,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(id,payment_date,amount,reference,cash_account_id,cash_accounts(name)),agency_rendition_game_amounts(id,game_type_id,amount,commission_percent,commission_amount,agency_game_types(id,name,category)),agency_rendition_tickets(id,ticket_number,ticket_qr_payload)").eq("agent_id", id).eq("organization_id", organization.id).neq("status", "void").order("created_at", { ascending: false }),
    supabase.from("agency_game_types").select("id,name,category,enabled").eq("organization_id", organization.id).order("sort_order").order("name"),
    supabase.from("agency_agent_game_commissions").select("game_type_id,commission_percent").eq("organization_id", organization.id).eq("agent_id", id),
    supabase.from("agency_game_commission_defaults").select("game_type_id,commission_percent").eq("organization_id", organization.id),
    supabase.from("agency_operational_settings").select("rendition_cutoff_time").eq("organization_id", organization.id).maybeSingle(),
  ]);
  const cutoffTime = String(operationalSettings?.rendition_cutoff_time ?? "00:00").slice(0, 5);
  const today = agencyBusinessDateForCutoff(cutoffTime);
  if (!agent) notFound();

  const rows = (renditions ?? []).map((row) => {
    const payments = Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : [];
    const received = payments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    return { ...row, received, pending: Math.max(0, Number(row.amount_due ?? 0) - received), payments };
  });
  const totalDue = rows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
  const totalReceived = rows.reduce((sum, row) => sum + row.received, 0);
  const totalPending = Math.max(0, totalDue - totalReceived);
  const totalCommission = rows.reduce((sum, row) => sum + (Array.isArray(row.agency_rendition_game_amounts) ? row.agency_rendition_game_amounts : []).reduce((acc, game) => acc + Number(game.commission_amount ?? 0), 0), 0);
  const typeLabel = agent.kind === "subagent" ? "Subagente" : "Ambulante";
  const code = agent.code ?? "SIN CÓDIGO";
  const allOfficialDrawPeriods = getAllOfficialDrawPeriods();
  const currentDrawPeriods = getOfficialDrawPeriodsForDate(today);
  const drawNow = new Date();
  const pendingDrawPeriods = currentDrawPeriods.filter((period) =>
    !rows.some((row: any) => String(row.rendition_date) === today && String(row.game_period ?? "").trim() === period.label) &&
    (!period.time || drawPeriodHasPassed(period, today, drawNow))
  );
  const defaultPendingDrawPeriod = getPreferredPendingDrawPeriod(pendingDrawPeriods);
  const unmappedGameNames = getUnmappedOfficialGameNames((gameTypes ?? []).filter((game) => game.enabled).map((game) => ({ name: game.name })));
  const defaultCommissionByGame = new Map((defaultCommissionRows ?? []).map((row) => [row.game_type_id, Number(row.commission_percent ?? 0)]));

  return (
    <div className={"page agency-detail-page " + (agent.kind === "subagent" ? "detail-subagent" : "detail-ambulant")}>
      <DailyBoundaryRefresh businessDate={today} cutoffTime={cutoffTime} drawTimes={currentDrawPeriods.map((period) => period.time).filter((time): time is string => Boolean(time))} renderedAt={new Date().toISOString()} />
      <div className="topbar">
        <div><Link href="/pagos" className="back-link">← Volver a Rendiciones</Link><p className="eyebrow">{typeLabel.toUpperCase()}</p><h1>{code}</h1><p className="muted">{typeLabel} · {agent.full_name} · {agent.is_active ? "Activo" : "Inactivo"}</p></div>
      </div>

      <section className="agency-profile">
        <div className="agency-profile-main"><div className="agency-avatar large">{code.slice(-2)}</div><div><span className="agency-kind">{typeLabel.toUpperCase()}</span><h2>{code}</h2><p>{agent.full_name} · administración, datos y rendiciones.</p></div></div>
        <div className="agency-profile-data"><div><span>Nombre</span><strong>{agent.full_name}</strong></div><div><span>Código</span><strong>{code}</strong></div><div><span>DNI</span><strong>{agent.dni || "—"}</strong></div><div><span>Teléfono</span><strong>{agent.phone || "—"}</strong></div><div><span>WhatsApp</span><strong>{agent.whatsapp || "—"}</strong></div><div><span>Alta</span><strong>{agent.created_at.slice(0, 10)}</strong></div></div>
      </section>

      <div className="stats-grid compact">
        <div className="stat-card"><span>Total rendido</span><strong>{money(totalDue, organization.currency_code)}</strong><small>importe generado</small></div>
        <div className="stat-card"><span>Total cobrado</span><strong>{money(totalReceived, organization.currency_code)}</strong><small>cobros registrados</small></div>
        <div className="stat-card"><span>Saldo pendiente</span><strong>{money(totalPending, organization.currency_code)}</strong><small>de {typeLabel.toLowerCase()} {code}</small></div>
        <div className="stat-card"><span>Comisión acumulada</span><strong>{money(totalCommission, organization.currency_code)}</strong><small>según tarifas vigentes en cada rendición</small></div>
      </div>

      {pageParams.resultado === "comisiones-guardadas" && <p className="message success-message">Comisiones guardadas. Se aplicarán automáticamente a las próximas rendiciones de este operador.</p>}
      {pageParams.error && <p className="message error-message">{pageParams.error === "comision-invalida" ? "Cada comisión debe estar entre 0 y 100 %." : "No se pudieron guardar las comisiones. Revisá tus permisos y volvé a intentar."}</p>}
      {isOwner && (
        <section className="panel agent-commission-panel">
          <div className="panel-head"><div><h2>Comisión por juego de este operador</h2><p className="muted">Dejá el campo vacío para heredar la comisión general de todos los agentes. Escribí un porcentaje solo cuando este subagente o ambulante tenga una excepción. El historial de cada rendición conserva el porcentaje aplicado.</p></div><div className="agent-commission-head-actions"><span className="badge success">Solo titular</span><Link href="/juegos#comision-general" className="button ghost">Comisión general de todos</Link></div></div>
          <form action={saveAgentGameCommissions} className="agent-commission-form">
            <input type="hidden" name="agent_id" value={agent.id} />
            <div className="agent-commission-list">
              {(gameTypes ?? []).map((game) => {
                const current = (commissionRows ?? []).find((row) => row.game_type_id === game.id);
                const generalPercent = defaultCommissionByGame.get(game.id) ?? 0;
                return <label className="agent-commission-row" key={game.id}>
                  <span><strong>{game.name}</strong><small>{game.category}{game.enabled ? "" : " · Inactivo"}</small><small className="commission-general-hint">{current ? "Excepción propia · general " + generalPercent.toFixed(2) + "%" : "Usa la general: " + generalPercent.toFixed(2) + "%"}</small></span>
                  <span className="commission-percent-input"><input type="number" name={"commission_" + game.id} min="0" max="100" step="0.01" inputMode="decimal" placeholder={generalPercent.toFixed(2)} defaultValue={current ? Number(current.commission_percent).toFixed(2) : ""} aria-label={"Porcentaje específico de " + game.name} /><em>%</em></span>
                </label>;
              })}
            </div>
            <p className="muted small-text">Un número, incluso 0, crea una excepción propia. Borrar el número y guardar vuelve a usar la comisión general.</p><button className="button primary" type="submit">Guardar porcentajes de este operador</button>
          </form>
        </section>
      )}

      {!agent.is_active ? <div className="message">Este agente está inactivo. Se conserva su historial, pero no se pueden crear rendiciones nuevas.</div> : (
        <section className="panel">
          <div className="panel-head"><div><h2>Rendición por sorteo</h2><p className="muted">Cada turno es una rendición independiente. El formulario solo ofrece sorteos vencidos que todavía no tienen un registro para esta jornada.</p><p className="muted small-text"><a href={OFFICIAL_QUINIELA_SCHEDULE_URL} target="_blank" rel="noreferrer">Programa oficial de sorteos</a> · <a href={OFFICIAL_EXTRACTS_SCHEDULE_URL} target="_blank" rel="noreferrer">Resultados publicados</a></p></div></div>
          {unmappedGameNames.length > 0 && <p className="message">Estos juegos aún no tienen un período de sorteo verificado y no aparecen en los formularios por turno: {unmappedGameNames.join(", ")}. Verificá el programa oficial antes de habilitarlos.</p>}
          {pendingDrawPeriods.length > 0
            ? <RenditionEntryForm agentId={agent.id} games={(gameTypes ?? []).filter((game) => game.enabled).map((game) => ({ id: game.id, name: game.name, category: game.category, enabled: game.enabled }))} today={today} periods={pendingDrawPeriods} allPeriods={allOfficialDrawPeriods} defaultPeriod={defaultPendingDrawPeriod?.label} />
            : <p className="message">No hay sorteos vencidos pendientes para esta jornada. Los próximos turnos se habilitan al llegar su horario oficial.</p>}
        </section>
      )}

      <section className="panel table-panel"><div className="panel-head"><div><h2>Rendiciones de {typeLabel.toLowerCase()} {code}</h2><p className="muted">Cada fila se abre para mostrar importes, tickets y cobros.</p></div><span className="muted">{rows.length} registros</span></div>
        <div className="rendition-history-list">
          {rows.map((row) => {
            const gameAmounts = Array.isArray(row.agency_rendition_game_amounts) ? row.agency_rendition_game_amounts : [];
            const tickets = Array.isArray(row.agency_rendition_tickets) ? row.agency_rendition_tickets : [];
            return <details className="rendition-record" key={row.id}>
              <summary>
                <span className="rendition-record-date">{row.rendition_date}<small>{formatAgencyDateTime(row.created_at)}</small></span>
                <span className="rendition-record-period">{row.game_period || "Período no identificado"}{row.draw_number ? <small>Sorteo {row.draw_number}</small> : null}</span>
                <span className="rendition-record-amount">{money(row.amount_due, organization.currency_code)}<small>{row.capture_method === "manual" ? "Carga manual" : row.capture_method === "qr" ? "Foto / QR" : "Foto del ticket"}</small></span>
                <span className={row.pending <= 0 ? "badge success" : "badge"}>{row.pending <= 0 ? "Saldada" : "Pendiente " + money(row.pending, organization.currency_code)}</span>
              </summary>
              <div className="rendition-record-detail">
                <h4>Juegos e importes</h4>
                <ul className="rendition-game-amounts">{gameAmounts.map((game) => <li key={game.id}><span>{game.agency_game_types?.name ?? "Juego"}<small className="commission-note">{Number(game.commission_percent ?? 0).toFixed(2)}% comisión · {money(game.commission_amount ?? 0, organization.currency_code)}</small></span><strong>{money(game.amount, organization.currency_code)}<small className="commission-note">neto {money(Number(game.amount) - Number(game.commission_amount ?? 0), organization.currency_code)}</small></strong></li>)}</ul>
                <p>Referencia: {row.reference || "—"}</p><p>Observaciones: {row.notes || "—"}</p>
                {tickets.map((ticket) => <div className="ticket-saved-list" key={ticket.id}><strong>Ticket</strong><code>{ticket.ticket_number}</code>{ticket.ticket_qr_payload && <small>QR: {ticket.ticket_qr_payload.slice(0, 100)}{ticket.ticket_qr_payload.length > 100 ? "…" : ""}</small>}</div>)}
                {row.pending > 0 ? <details className="agency-pay-details"><summary>Registrar cobro en Caja</summary><form action={receiveAgencyRendition} className="agency-pay-form"><input type="hidden" name="rendition_id" value={row.id}/><input type="hidden" name="agent_id" value={agent.id}/><label>Fecha<input type="date" name="payment_date" required defaultValue={today} /></label><label>Importe<input type="number" name="amount" min="0.01" max={row.pending} step="0.01" placeholder="Importe" required /></label><span className="agency-cash-fixed">Caja</span><input name="reference" placeholder="Referencia"/><button className="button primary" type="submit">Registrar cobro</button></form></details> : null}
              </div>
            </details>;
          })}
          {!rows.length && <p className="rendition-history-empty">Todavía no hay rendiciones registradas.</p>}
        </div>
      </section>
    </div>
  );
}
