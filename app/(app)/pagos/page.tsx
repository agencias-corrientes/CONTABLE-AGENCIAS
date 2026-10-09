import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { formatAgencyDateTime, todayInAgencyTimeZone } from "@/lib/agency-datetime";
import { RenditionEntryForm } from "@/components/rendition-entry-form";
import { getOfficialLotteryFeed } from "@/lib/loteria-correntina";
import { receiveAgencyRendition, voidAgencyRendition } from "../agencias/actions";

type GameAmount = {
  id: string;
  game_type_id: string;
  amount: number | string;
  agency_game_types: { id: string; name: string; category: string } | null;
};

export default async function PagosPage({ searchParams }: { searchParams?: Promise<{ agent?: string; resultado?: string; error?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const selectedAgentId = params.agent ?? "";
  const { supabase, organization, member, userId } = await getCurrentContext();
  if (!organization || !member) return null;
  const activeOrganization = organization;
  const manager = member.role === "owner" || member.role === "admin";
  const { data: permissions } = manager
    ? { data: { can_create_renditions: true, can_edit_renditions: true, can_delete_renditions: true, can_register_payments: true, can_manage_backups: true } }
    : await supabase.from("organization_member_permissions").select("can_create_renditions,can_edit_renditions,can_delete_renditions,can_register_payments,can_manage_backups").eq("organization_id", activeOrganization.id).eq("user_id", userId).maybeSingle();
  const canCreateRenditions = Boolean(permissions?.can_create_renditions);
  const canEditRenditions = Boolean(permissions?.can_edit_renditions);
  const canDeleteRenditions = Boolean(permissions?.can_delete_renditions);
  const canRegisterPayments = Boolean(permissions?.can_register_payments);

  const today = todayInAgencyTimeZone();
  const [{ data: agents }, { data: renditions }, { data: gameTypes }, lottery] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,full_name,code,is_active,phone").eq("organization_id", activeOrganization.id).order("kind").order("code"),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,created_at,game_period,draw_number,capture_method,amount_due,status,reference,notes,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(id,payment_date,amount,reference),agency_rendition_game_amounts(id,game_type_id,amount,agency_game_types(id,name,category)),agency_rendition_tickets(id,ticket_number,ticket_qr_payload)").eq("organization_id", activeOrganization.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("agency_game_types").select("id,name,category,enabled").eq("organization_id", activeOrganization.id).order("sort_order").order("name"),
    getOfficialLotteryFeed(),
  ]);

  const agentRows = agents ?? [];
  const activeAgents = agentRows.filter((agent) => agent.is_active);
  const archivedAgents = agentRows.filter((agent) => !agent.is_active);
  const allRows = (renditions ?? []) as any[];
  const rows = allRows.filter((row) => row.status !== "void");
  const voidRows = allRows.filter((row) => row.status === "void");
  const todayRows = rows.filter((row) => row.rendition_date === today);
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

  function RenditionHistory({ agent }: { agent: any }) {
    const agentRows = rows.filter((row) => row.agent_id === agent.id);
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
                <span className="rendition-record-date">{row.rendition_date}<small>{formatAgencyDateTime(row.created_at)}</small></span>
                <span className="rendition-record-period">{row.game_period || "Período no identificado"}{row.draw_number ? <small>Sorteo {row.draw_number}</small> : null}</span>
                <span className="rendition-record-amount">{money(row.amount_due, activeOrganization.currency_code)}<small>{row.capture_method === "manual" ? "Carga manual" : row.capture_method === "qr" ? "Foto / QR" : "Foto del ticket"}</small></span>
                <span className={totals.pending <= 0 ? "badge success" : "badge"}>{totals.pending <= 0 ? "Saldada" : "Pendiente " + money(totals.pending, activeOrganization.currency_code)}</span>
              </summary>
              <div className="rendition-record-detail">
                <div className="rendition-detail-columns">
                  <div>
                    <h4>Detalle por juego</h4>
                    {gameAmounts.length ? <ul className="rendition-game-amounts">{gameAmounts.map((game) => <li key={game.id}><span>{game.agency_game_types?.name ?? "Juego"}</span><strong>{money(game.amount, activeOrganization.currency_code)}</strong></li>)}</ul> : <p className="muted">No hay juegos asociados.</p>}
                    <p className="rendition-grand-total"><span>Total rendido</span><strong>{money(row.amount_due, activeOrganization.currency_code)}</strong></p>
                  </div>
                  <div>
                    <h4>Ticket, período y observaciones</h4>
                    <dl className="rendition-metadata">
                      <div><dt>Fecha del juego</dt><dd>{row.rendition_date}</dd></div>
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
    const received = agentRows.reduce((sum, row) => sum + rowTotals(row).received, 0);
    const due = agentRows.reduce((sum, row) => sum + Number(row.amount_due ?? 0), 0);
    const pending = Math.max(0, due - received);
    const last = agentRows[0];
    const subagent = agent.kind === "subagent";
    return (
      <details className={"rendition-agent-accordion " + (subagent ? "rendition-subagent" : "rendition-ambulant")} open={selectedAgentId === agent.id}>
        <summary className="rendition-agent-summary">
          <span className="rendition-agent-kind">{agentLabel(agent).toUpperCase()}</span>
          <strong className="rendition-agent-code">{agent.code}</strong>
          <span className="rendition-agent-name">{agent.full_name}</span>
          <span className="rendition-agent-balance"><small>Saldo pendiente</small><strong>{money(pending, activeOrganization.currency_code)}</strong></span>
          <span className="rendition-agent-latest"><small>Última rendición</small><strong>{last ? formatAgencyDateTime(last.created_at) : "Sin rendiciones"}</strong></span>
          <span className="rendition-open-label">Abrir rendiciones ▾</span>
        </summary>
        <div className="rendition-agent-expanded">
          <div className="rendition-agent-expanded-head">
            <div><span className="eyebrow">RENDICIÓN DIARIA</span><h3>{agentLabel(agent)} {agent.code} · {agent.full_name}</h3><p className="muted">Escaneá el ticket o QR; revisá los importes detectados antes de guardar.</p></div>
            <Link href={"/agencias/" + agent.id} className="button ghost">Ficha del agente</Link>
          </div>
          {canCreateRenditions
            ? <RenditionEntryForm agentId={agent.id} games={games} today={today} />
            : <p className="message">No tenés permiso para registrar rendiciones. El titular debe habilitar esta operación.</p>}
          <section className="rendition-agent-history">
            <div className="panel-head"><div><h3>Rendiciones registradas</h3><p className="muted">Cada registro se abre para ver juegos, importes, tickets y cobros.</p></div><span className="muted">{agentRows.length} registros</span></div>
            <RenditionHistory agent={agent} />
          </section>
        </div>
      </details>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">CONTROL OPERATIVO DIARIO</p><h1>Rendiciones</h1><p className="muted">Elegí un subagente o ambulante. La tarjeta se despliega para fotografiar el ticket, leer el QR o cargar importes manualmente.</p></div>
        <Link href="/agencias" className="button ghost">Administrar agentes</Link>
      </div>

      {params.resultado === "rendicion-creada" && <p className="message success-message">Rendición registrada correctamente. Se intentó generar/enviar su respaldo; consultá Personal y permisos para verificar el estado del correo.</p>}
      {params.resultado === "rendicion-corregida" && <p className="message success-message">Rendición corregida. La modificación se conserva en auditoría y crea una nueva revisión del respaldo de texto.</p>}
      {params.resultado === "rendicion-anulada" && <p className="message success-message">Rendición anulada con historial conservado. Podés registrar una nueva rendición sin perder el registro anterior.</p>}
      {params.error && <p className="message error-message">{({
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

      <div className="stats-grid compact rendition-stats">
        <div className="stat-card"><span>Rendido hoy</span><strong>{money(todayRendido, activeOrganization.currency_code)}</strong><small>{todayRows.length} registros</small></div>
        <div className="stat-card"><span>Cobrado hoy</span><strong>{money(todayCobrado, activeOrganization.currency_code)}</strong><small>cobros registrados</small></div>
        <div className="stat-card"><span>Pendiente hoy</span><strong>{money(todayPendiente, activeOrganization.currency_code)}</strong><small>saldo del día</small></div>
        <div className="stat-card"><span>Agentes activos</span><strong>{activeAgents.length}</strong><small>{activeAgents.filter((agent) => agent.kind === "subagent").length} subagentes · {activeAgents.filter((agent) => agent.kind === "ambulant").length} ambulantes</small></div>
      </div>

      <section className="panel rendition-agents-panel">
        <div className="panel-head"><div><h2>Subagentes y ambulantes</h2><p className="muted">Hacé un clic en una tarjeta para abrir el formulario y el historial correspondiente.</p></div><span className="muted">{activeAgents.length} activos</span></div>
        <div className="rendition-agent-list">
          {activeAgents.map((agent) => <AgentAccordion key={agent.id} agent={agent} />)}
          {!activeAgents.length && <div className="agency-empty">No hay agentes activos. <Link href="/agencias">Agregá uno desde Administración de agentes.</Link></div>}
        </div>
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
                    <span className="rendition-record-date">{row.rendition_date}<small>{formatAgencyDateTime(row.created_at)}</small></span>
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

      <section className="panel lottery-board">
        <div className="panel-head"><div><p className="eyebrow">FUENTE OFICIAL</p><h2>Horarios y extractos de Lotería Correntina</h2><p className="muted">Calendario consultado desde Lotemóvil y actualizado en caché cada cinco minutos.</p></div><a href={lottery.sourceUrl} target="_blank" rel="noreferrer" className="button ghost">Abrir Lotemóvil ↗</a></div>
        <div className="lottery-feed-meta">{lottery.ok ? <span className="badge success">Conectado</span> : <span className="badge warning">Fuente temporalmente no disponible</span>}<span>Consulta: {formatAgencyDateTime(lottery.updatedAt)}</span>{lottery.resultDate && <span>Último extracto destacado: {lottery.resultDate}</span>}</div>
        {lottery.resultTitle && <p className="lottery-latest-title">{lottery.resultTitle}</p>}
        {lottery.error && <p className="message">No se pudo actualizar el calendario ahora. Podés abrir la fuente oficial: <a href={lottery.sourceUrl} target="_blank" rel="noreferrer">Lotemóvil</a>.</p>}
        <div className="lottery-schedule-grid">
          {lottery.schedules.map((item, index) => <article className="lottery-schedule-item" key={item.game + "-" + item.drawName + "-" + index}><span>{item.game}</span><strong>{item.drawName}</strong><dl><div><dt>Sorteo</dt><dd>{item.drawAt}</dd></div><div><dt>Apertura</dt><dd>{item.opensAt}</dd></div><div><dt>Cierre</dt><dd>{item.closesAt}</dd></div></dl></article>)}
          {lottery.ok && !lottery.schedules.length && <p className="muted">La fuente no devolvió horarios en este momento. Consultá el cronograma en el enlace oficial.</p>}
        </div>
        <details className="lottery-archives">
          <summary>Extractos recientes por juego ({lottery.archives.length})</summary>
          <div className="lottery-archive-groups">
            {lottery.games.map((game) => {
              const archives = lottery.archives.filter((archive) => archive.game === game.name);
              return <div className="lottery-archive-group" key={game.name}><div><strong>{game.name}</strong><a href={game.url} target="_blank" rel="noreferrer">Abrir sección oficial ↗</a></div>{archives.length ? <ul>{archives.map((archive) => <li key={archive.url}><a href={archive.url} target="_blank" rel="noreferrer">Extracto {archive.date}</a></li>)}</ul> : <p className="muted">Consultá los extractos en la <a href={game.url} target="_blank" rel="noreferrer">sección oficial</a>.</p>}</div>;
            })}
          </div>
        </details>
        <p className="lottery-source-note">Los horarios y links de extractos se leen desde el portal externo. Si cambia su estructura, se muestra una alerta sin inventar resultados.</p>
      </section>
    </div>
  );
}
