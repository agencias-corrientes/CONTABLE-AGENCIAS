import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { agencyBusinessDateForCutoff, formatAgencyDate, formatAgencyDateTime } from "@/lib/agency-datetime";
import { DailyBoundaryRefresh } from "@/components/daily-boundary-refresh";
import { RenditionScrollHelper } from "@/components/rendition-scroll-helper";
import { RenditionEntryForm } from "@/components/rendition-entry-form";
import { receiveAgencyRendition, voidAgencyRendition } from "../agencias/actions";

type GameAmount = {
  id: string;
  game_type_id: string;
  amount: number | string;
  commission_percent: number | string;
  commission_amount: number | string;
  agency_game_types: { id: string; name: string; category: string } | null;
};

export default async function PagosPage({ searchParams }: { searchParams?: Promise<{ agent?: string; busqueda?: string; resultado?: string; error?: string; backup?: string; foto?: string }> }) {
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

  const [{ data: operationalSettings }, { data: agents }, { data: renditions }, { data: gameTypes }] = await Promise.all([
    supabase.from("agency_operational_settings").select("rendition_cutoff_time").eq("organization_id", activeOrganization.id).maybeSingle(),
    supabase.from("agency_agents").select("id,kind,full_name,code,is_active,phone").eq("organization_id", activeOrganization.id).order("kind").order("code"),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,created_at,game_period,draw_number,capture_method,amount_due,status,reference,notes,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(id,payment_date,amount,reference),agency_rendition_game_amounts(id,game_type_id,amount,commission_percent,commission_amount,agency_game_types(id,name,category)),agency_rendition_tickets(id,ticket_number,ticket_qr_payload)").eq("organization_id", activeOrganization.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("agency_game_types").select("id,name,category,enabled").eq("organization_id", activeOrganization.id).order("sort_order").order("name"),
  ]);
  const cutoffTime = String(operationalSettings?.rendition_cutoff_time ?? "00:00").slice(0, 5);
  const today = agencyBusinessDateForCutoff(cutoffTime);

  const agentRows = agents ?? [];
  const activeAgents = agentRows.filter((agent) => agent.is_active);
  const archivedAgents = agentRows.filter((agent) => !agent.is_active);
  const allRows = (renditions ?? []) as any[];
  const rows = allRows.filter((row) => row.status !== "void");
  const voidRows = allRows.filter((row) => row.status === "void");
  const isCurrentOperationalDay = (row: any) => agencyBusinessDateForCutoff(cutoffTime, String(row.created_at ?? "")) === today;
  const todayRows = rows.filter(isCurrentOperationalDay);
  const historicalRows = rows.filter((row) => !isCurrentOperationalDay(row));
  const historicalByDay = new Map<string, any[]>();
  for (const row of historicalRows) {
    const day = agencyBusinessDateForCutoff(cutoffTime, String(row.created_at ?? ""));
    historicalByDay.set(day, [...(historicalByDay.get(day) ?? []), row]);
  }
  const historicalDays = Array.from(historicalByDay.entries()).sort(([a], [b]) => b.localeCompare(a));
  const filteredActiveAgents = activeAgents.filter((agent) => {
    if (!normalizedSearch) return true;
    return [agent.code, agent.full_name, agent.phone ?? "", agent.kind === "subagent" ? "subagente" : "ambulante"]
      .some((value) => String(value).toLocaleLowerCase("es-AR").includes(normalizedSearch));
  });
  const todayRendido = todayRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
  const todayCobrado = todayRows.reduce((sum, row) => sum + (Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : []).reduce((subtotal: number, payment: any) => subtotal + Number(payment.amount ?? 0), 0), 0);
  const todayPendiente = Math.max(0, todayRendido - todayCobrado);
  const allGames = (gameTypes ?? []).map((game) => ({ id: game.id, name: game.name, category: game.category, enabled: game.enabled }));
  const games = allGames.filter((game) => game.enabled).map(({ id, name, category }) => ({ id, name, category }));
  const agentLabel = (agent: any) => agent.kind === "subagent" ? "Subagente" : "Ambulante";
  const rowTotals = (row: any) => {
    const payments = Array.isArray(row.agency_rendition_payments) ? row.agency_rendition_payments : [];
    const received = payments.reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);
    return { received, pending: Math.max(0, Number(row.amount_due ?? 0) - received), payments };
  };

  function RenditionHistory({ agent, historyRows = rows }: { agent: any; historyRows?: any[] }) {
    const agentRows = historyRows.filter((row) => row.agent_id === agent.id);
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
                <span className={totals.pending <= 0 ? "badge success" : "badge"}>{totals.pending <= 0 ? "Saldada" : "Pendiente " + money(totals.pending, activeOrganization.currency_code)}</span>
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
                <div className="rendition-payment-summary"><span>Cobrado: <strong>{money(totals.received, activeOrganization.currency_code)}</strong></span><span>Pendiente: <strong>{money(totals.pending, activeOrganization.currency_code)}</strong></span></div>
                {totals.pending > 0 && canRegisterPayments && (
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
                {totals.pending > 0 && !canRegisterPayments && <p className="muted small-text">No tenés permiso para registrar cobros. El titular debe habilitar esta operación.</p>}
                {canEditRenditions && totals.received <= 0 && row.status === "open" && (
                  <details className="rendition-edit-details">
                    <summary>Modificar rendición</summary>
                    <div className="rendition-correction-panel">
                      <p className="muted small-text">Los cambios guardan una revisión nueva y conservan el registro en auditoría. Solo se permite editar antes de registrar cobros.</p>
                      <RenditionEntryForm
                        agentId={agent.id}
                        games={allGames}
                        today={today}
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
    const agentRows = rows.filter((row) => row.agent_id === agent.id);
    const todayAgentRows = todayRows.filter((row) => row.agent_id === agent.id);
    // The "jornada actual" balance only includes renditions from the current operational day.
    // Unpaid historical renditions remain visible in Rendiciones generales / Cobranzas.
    const received = todayAgentRows.reduce((sum, row) => sum + rowTotals(row).received, 0);
    const due = todayAgentRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
    const commission = todayAgentRows.reduce((sum, row) => sum + (Array.isArray(row.agency_rendition_game_amounts) ? row.agency_rendition_game_amounts : []).reduce((acc: number, game: any) => acc + Number(game.commission_amount ?? 0), 0), 0);
    const pending = Math.max(0, due - received);
    const netDue = Math.max(0, due - commission);
    const last = agentRows[0];
    const subagent = agent.kind === "subagent";
    return (
      <details className={"rendition-agent-accordion " + (subagent ? "rendition-subagent" : "rendition-ambulant")} open={selectedAgentId === agent.id}>
        <summary className="rendition-agent-summary" aria-label={agentLabel(agent) + " " + agent.code + " — abrir rendición"}>
          <strong className="rendition-agent-code">{agent.code}</strong>
        </summary>
        <div className="rendition-agent-expanded">
          <div className="rendition-agent-expanded-head">
            <div><span className="eyebrow">RENDICIÓN DIARIA</span><h3>{agentLabel(agent)} {agent.code} · {agent.full_name}</h3><p className="muted">Comisión acumulada: <strong>{money(commission, activeOrganization.currency_code)}</strong> · Neto estimado: <strong>{money(netDue, activeOrganization.currency_code)}</strong>. Revisá los importes detectados antes de guardar.</p></div>
            <Link href={"/agencias/" + agent.id} className="button ghost">Ficha del agente</Link>
          </div>
          {canCreateRenditions
            ? <RenditionEntryForm agentId={agent.id} games={games} today={today} />
            : <p className="message">No tenés permiso para registrar rendiciones. El titular debe habilitar esta operación.</p>}
          <section className="rendition-agent-history">
            <div className="panel-head"><div><h3>Rendiciones del día operativo</h3><p className="muted">Las anteriores quedan en Rendiciones generales y no se mezclan con la jornada nueva.</p></div><span className="muted">{todayAgentRows.length} registros</span></div>
            <RenditionHistory agent={agent} historyRows={todayRows} />
          </section>
        </div>
      </details>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">CONTROL OPERATIVO DIARIO</p><h1>Rendiciones</h1><p className="muted">Elegí un subagente o ambulante. Los botones compactos abren la carga de rendición del subagente o ambulante seleccionado.</p></div>
        <Link href="/agencias" className="button ghost">Administrar agentes</Link>
      </div>

      {params.resultado === "rendicion-creada" && <p className={params.backup === "enviado" ? "message success-message" : "message backup-pending-message"}>Rendición registrada correctamente. {params.backup === "enviado" ? "El backup de texto se envió al correo configurado para el titular." : "El backup quedó guardado, pero el correo no confirmó la entrega. Revisá el estado en Personal y permisos."}{params.foto === "no-adjunta" ? " La foto no se adjuntó; el respaldo de texto se conserva." : ""}</p>}
      {params.resultado === "rendicion-corregida" && <p className={params.backup === "enviado" ? "message success-message" : "message backup-pending-message"}>Rendición corregida. Se conserva la auditoría y se creó una nueva revisión del respaldo. {params.backup === "enviado" ? "El correo se envió." : "El correo no confirmó entrega; la revisión permanece guardada para reintento."}</p>}
      {params.resultado === "rendicion-anulada" && <p className={params.backup === "enviado" ? "message success-message" : "message backup-pending-message"}>Rendición anulada con historial conservado. {params.backup === "enviado" ? "El respaldo actualizado se envió al correo del titular." : "El respaldo quedó registrado, pero el correo no confirmó entrega."}</p>}
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
        "rendicion-fallida": "No se pudo registrar la rendición."
      } as Record<string,string>)[params.error] ?? "La operación no se pudo completar. Verificá permisos y datos."}</p>}

      <DailyBoundaryRefresh businessDate={today} cutoffTime={cutoffTime} />
      <RenditionScrollHelper />
      <div className="stats-grid compact rendition-stats">
        <div className="stat-card"><span>Rendido hoy</span><strong>{money(todayRendido, activeOrganization.currency_code)}</strong><small>{todayRows.length} registros</small></div>
        <div className="stat-card"><span>Cobrado hoy</span><strong>{money(todayCobrado, activeOrganization.currency_code)}</strong><small>cobros registrados</small></div>
        <div className="stat-card"><span>Pendiente hoy</span><strong>{money(todayPendiente, activeOrganization.currency_code)}</strong><small>saldo del día</small></div>
        <div className="stat-card"><span>Agentes activos</span><strong>{activeAgents.length}</strong><small>{activeAgents.filter((agent) => agent.kind === "subagent").length} subagentes · {activeAgents.filter((agent) => agent.kind === "ambulant").length} ambulantes</small></div>
      </div>

      <form method="get" action="/pagos" className="rendition-agent-search" role="search">
        <label htmlFor="rendition-agent-query">Buscar operador</label>
        <input id="rendition-agent-query" name="busqueda" type="search" autoComplete="off" value={searchTerm} placeholder="Código, nombre o teléfono" />
        <button className="button primary" type="submit">Buscar</button>
        {searchTerm && <Link className="button ghost" href="/pagos">Limpiar</Link>}
      </form>

      <section className="panel rendition-agents-panel">
        <div className="panel-head"><div><h2>Subagentes y ambulantes · jornada actual</h2><p className="muted">Elegí un botón para abrir la carga. Los saldos de esta sección corresponden únicamente a la jornada actual.</p></div><span className="muted">{filteredActiveAgents.length} visibles · {activeAgents.length} activos</span></div>
        <div className="rendition-agent-list">
          {filteredActiveAgents.map((agent) => <AgentAccordion key={agent.id} agent={agent} />)}
          {!filteredActiveAgents.length && <div className="agency-empty">{searchTerm ? "No hay subagentes ni ambulantes que coincidan con esa búsqueda." : "No hay agentes activos. "}<Link href="/agencias">Administrar subagentes y ambulantes</Link></div>}
        </div>
      </section>

      <section className="panel rendition-general-history">
        <div className="panel-head"><div><h2>Rendiciones generales</h2><p className="muted">Cada registro muestra el código del subagente o ambulante, la fecha y el importe rendido. El historial se separa por día operativo.</p></div><span className="muted">{historicalRows.length} rendiciones anteriores</span></div>
        {historicalDays.length ? <div className="rendition-archive-days">
          {historicalDays.map(([day, dayRows]) => {
            const total = dayRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
            const ids = Array.from(new Set(dayRows.map((row) => String(row.agent_id))));
            return <details className="rendition-archive-day" key={day}>
              <summary><span><strong>{formatAgencyDate(day)}</strong><small>{dayRows.length} rendiciones</small></span><strong>{money(total, activeOrganization.currency_code)}</strong><span className="rendition-open-label">Ver día ▾</span></summary>
              <div className="rendition-archive-agents">
                {ids.map((id) => {
                  const agent = agentRows.find((item) => item.id === id);
                  if (!agent) return null;
                  const count = dayRows.filter((row) => row.agent_id === id).length;
                  return <details className="rendition-archive-agent" key={id}>
                    <summary><span>{agent.kind === "subagent" ? "Subagente" : "Ambulante"}</span><strong>{agent.code} · {agent.full_name}</strong><small>{count} rendiciones</small></summary>
                    <RenditionHistory agent={agent} historyRows={dayRows} />
                  </details>;
                })}
              </div>
            </details>;
          })}
        </div> : <p className="muted rendition-archive-empty">Todavía no hay rendiciones de jornadas anteriores. Se archivarán automáticamente al comenzar una nueva jornada.</p>}
      </section>

      {!!archivedAgents.length && (
        <section className="panel archived-rendition-panel">
          <div className="panel-head"><div><h2>Agentes inactivos con historial</h2><p className="muted">Sus rendiciones anteriores siguen disponibles; no se pueden crear nuevas.</p></div><span className="muted">{archivedAgents.length}</span></div>
          <div className="rendition-agent-list">
            {archivedAgents.map((agent) => (
              <details key={agent.id} className="rendition-agent-accordion archived-rendition-agent">
                <summary className="rendition-agent-summary"><span className="rendition-agent-kind">INACTIVO</span><strong className="rendition-agent-code">{agent.code}</strong><span className="rendition-agent-name">{agent.full_name}</span><span className="rendition-open-label">Ver historial ▾</span></summary>
                <div className="rendition-agent-expanded"><RenditionHistory agent={agent} /></div>
              </details>
            ))}
          </div>
        </section>
      )}

      {!!voidRows.length && (
        <section className="panel rendition-void-history">
          <div className="panel-head">
            <div><h2>Rendiciones anuladas</h2><p className="muted">Se conservan para auditoría. No suman a los totales operativos ni se eliminan del historial.</p></div>
            <span className="muted">{voidRows.length} registros</span>
          </div>
          <div className="rendition-history-list">
            {voidRows.map((row) => {
              const agent = agentRows.find((item) => item.id === row.agent_id);
              const gameAmounts = (Array.isArray(row.agency_rendition_game_amounts) ? row.agency_rendition_game_amounts : []) as GameAmount[];
              const tickets = Array.isArray(row.agency_rendition_tickets) ? row.agency_rendition_tickets : [];
              return (
                <details className="rendition-record voided-record" key={row.id}>
                  <summary>
                    <span className="rendition-record-date">{formatAgencyDate(row.rendition_date)}<small>{formatAgencyDateTime(row.created_at)}</small></span>
                    <span className="rendition-record-period">{agent ? agent.code + " · " + agent.full_name : "Agente"}</span>
                    <span className="rendition-record-amount">{money(row.amount_due, activeOrganization.currency_code)}<small>Anulada</small></span>
                    <span className="badge">Historial</span>
                  </summary>
                  <div className="rendition-record-detail">
                    <p><strong>Operador:</strong> {agent?.kind === "ambulant" ? "Ambulante" : "Subagente"} {agent?.code ?? "—"} · {agent?.full_name ?? "—"}</p>
                    <p><strong>Período:</strong> {row.game_period || "—"} · <strong>Sorteo:</strong> {row.draw_number || "—"} · <strong>Referencia:</strong> {row.reference || "—"}</p>
                    <h4>Importes guardados en la rendición anulada</h4>
                    {gameAmounts.length
                      ? <ul className="rendition-game-amounts">{gameAmounts.map((game) => <li key={game.id}><span>{game.agency_game_types?.name ?? "Juego"}</span><strong>{money(game.amount, activeOrganization.currency_code)}</strong></li>)}</ul>
                      : <p className="muted">No hay desglose de juego asociado.</p>}
                    {tickets.length > 0 && <div className="ticket-saved-list"><strong>Tickets guardados</strong>{tickets.map((ticket: any) => <div key={ticket.id}><code>{ticket.ticket_number}</code>{ticket.ticket_qr_payload && <small>QR: {ticket.ticket_qr_payload.slice(0, 100)}{ticket.ticket_qr_payload.length > 100 ? "…" : ""}</small>}</div>)}</div>}
                    <p><strong>Motivo / observaciones:</strong> {row.notes || "No se indicó un motivo."}</p>
                    {agent && <Link href={"/pagos?agent=" + agent.id} className="button ghost small">Volver a rendiciones de este operador</Link>}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}


    </div>
  );
}
