import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";

type AgentRow = {
  id: string;
  kind: "subagent" | "ambulant";
  code: string | null;
  full_name: string;
};

type RenditionRow = {
  id: string;
  agent_id: string;
  rendition_date: string;
  amount_due: number;
  reference: string | null;
};

type TicketRow = {
  id: string;
  ticket_number: string;
  rendition_id: string;
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().toLowerCase();
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const [{ data: agents }, { data: renditions }, { data: tickets }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,code,full_name").eq("organization_id", organization.id).order("code").limit(1000),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,amount_due,reference").eq("organization_id", organization.id).neq("status", "void").order("rendition_date", { ascending: false }).limit(1000),
    supabase.from("agency_rendition_tickets").select("id,ticket_number,rendition_id").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(2000),
  ]);

  const agentRows = (agents ?? []) as AgentRow[];
  const renditionRows = (renditions ?? []) as RenditionRow[];
  const ticketRows = (tickets ?? []) as TicketRow[];
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const renditionById = new Map(renditionRows.map((rendition) => [rendition.id, rendition]));

  const matchedAgents = !query ? [] : agentRows.filter((agent) =>
    [agent.code, agent.full_name, agent.kind === "ambulant" ? "ambulante" : "subagente"]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  );
  const matchedRenditions = !query ? [] : renditionRows.filter((rendition) =>
    [rendition.id, rendition.rendition_date, rendition.reference]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query))
  );
  const matchedTickets = !query ? [] : ticketRows.filter((ticket) => ticket.ticket_number.toLowerCase().includes(query));

  const totalMatches = matchedAgents.length + matchedRenditions.length + matchedTickets.length;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">BUSCADOR</p>
          <h1>Buscar operaciones</h1>
          <p className="muted">Buscá por código o nombre de subagente/ambulante, referencia o fecha de rendición, o número de ticket.</p>
        </div>
        <Link href="/dashboard" className="button ghost">Volver a Inicio</Link>
      </div>

      <section className="panel search-panel">
        <form action="/buscar" method="get" className="global-search-form">
          <input name="q" defaultValue={q} type="search" placeholder="Ej.: 251-010-01 · Juan · 2026-10-06 · 00123456" autoFocus />
          <button className="button primary">Buscar</button>
        </form>
      </section>

      {!query ? (
        <section className="panel search-empty-panel">
          <div className="empty-state"><div><strong>Ingresá un dato para buscar.</strong><p className="muted">El sistema revisará subagentes, ambulantes, rendiciones y tickets.</p></div></div>
        </section>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card"><span>Resultados</span><strong>{totalMatches}</strong><small>coincidencias encontradas</small></div>
            <div className="stat-card"><span>Subagentes / ambulantes</span><strong>{matchedAgents.length}</strong><small>por código o nombre</small></div>
            <div className="stat-card"><span>Rendiciones</span><strong>{matchedRenditions.length}</strong><small>por fecha o referencia</small></div>
            <div className="stat-card"><span>Tickets</span><strong>{matchedTickets.length}</strong><small>por número</small></div>
          </div>

          <section className="panel table-panel">
            <div className="panel-head"><div><h2>Subagentes y ambulantes</h2><p className="muted">Coincidencias de identidad operativa.</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Código</th><th>Nombre</th><th></th></tr></thead><tbody>
              {matchedAgents.slice(0, 20).map((agent) => <tr key={agent.id}><td>{agent.kind === "ambulant" ? "Ambulante" : "Subagente"}</td><td className="mono">{agent.code ?? "—"}</td><td>{agent.full_name}</td><td><Link href={`/agencias/${agent.id}`} className="agency-enter">Abrir →</Link></td></tr>)}
              {!matchedAgents.length && <tr><td colSpan={4}>Sin coincidencias.</td></tr>}
            </tbody></table></div>
          </section>

          <section className="panel table-panel">
            <div className="panel-head"><div><h2>Rendiciones</h2><p className="muted">Resultados por fecha, referencia o identificador.</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Subagente / ambulante</th><th>Código</th><th>Importe</th><th>Referencia</th><th></th></tr></thead><tbody>
              {matchedRenditions.slice(0, 20).map((rendition) => { const agent = agentById.get(rendition.agent_id); return <tr key={rendition.id}><td>{rendition.rendition_date}</td><td>{agent?.kind === "ambulant" ? "Ambulante" : "Subagente"}</td><td className="mono">{agent?.code ?? "—"}</td><td className="mono">{money(rendition.amount_due, organization.currency_code)}</td><td>{rendition.reference || "—"}</td><td><Link href={`/agencias/${rendition.agent_id}`} className="agency-enter">Abrir →</Link></td></tr>; })}
              {!matchedRenditions.length && <tr><td colSpan={6}>Sin coincidencias.</td></tr>}
            </tbody></table></div>
          </section>

          <section className="panel table-panel">
            <div className="panel-head"><div><h2>Tickets</h2><p className="muted">Tickets encontrados por número y su rendición asociada.</p></div></div>
            <div className="table-wrap"><table><thead><tr><th>Ticket</th><th>Fecha</th><th>Subagente / ambulante</th><th>Código</th><th>Importe rendido</th><th></th></tr></thead><tbody>
              {matchedTickets.slice(0, 30).map((ticket) => { const rendition = renditionById.get(ticket.rendition_id); const agent = rendition ? agentById.get(rendition.agent_id) : undefined; return <tr key={ticket.id}><td className="mono"><strong>{ticket.ticket_number}</strong></td><td>{rendition?.rendition_date ?? "—"}</td><td>{agent?.kind === "ambulant" ? "Ambulante" : "Subagente"}</td><td className="mono">{agent?.code ?? "—"}</td><td className="mono">{rendition ? money(rendition.amount_due, organization.currency_code) : "—"}</td><td>{agent ? <Link href={`/agencias/${agent.id}`} className="agency-enter">Abrir →</Link> : "—"}</td></tr>; })}
              {!matchedTickets.length && <tr><td colSpan={6}>Sin coincidencias.</td></tr>}
            </tbody></table></div>
          </section>
        </>
      )}
    </div>
  );
}
