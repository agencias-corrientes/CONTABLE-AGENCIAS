import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { createGameType, deleteGameType, updateGameType } from "./actions";

type Breakdown = {
  id: string;
  amount: number | string;
  game_type_id: string;
  agency_game_types: { id: string; name: string; category: string } | null;
  agency_renditions: { agent_id: string; rendition_date: string; status: string } | null;
};

export default async function GamesPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const { supabase, organization, member } = await getCurrentContext();
  if (!organization || !member) return null;
  const canManageGames = member.role === "owner" || member.role === "admin";

  const [{ data: games }, { data: breakdowns }, { data: agents }] = await Promise.all([
    supabase
      .from("agency_game_types")
      .select("id,name,category,enabled,sort_order")
      .eq("organization_id", organization.id)
      .order("sort_order")
      .order("name"),
    supabase
      .from("agency_rendition_game_amounts")
      .select("id,amount,game_type_id,agency_game_types(id,name,category),agency_renditions(agent_id,rendition_date,status)")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agency_agents")
      .select("id,kind,full_name,code,is_active")
      .eq("organization_id", organization.id)
      .order("kind")
      .order("code"),
  ]);

  const gameRows = games ?? [];
  const agentRows = agents ?? [];
  const details = (breakdowns ?? []) as Breakdown[];

  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const totalRevenue = details.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

  const totals = new Map<string, number>();
  const byGameAgent = new Map<string, Map<string, number>>();
  for (const item of details) {
    const gameId = item.game_type_id;
    const agentId = item.agency_renditions?.agent_id;
    totals.set(gameId, (totals.get(gameId) ?? 0) + Number(item.amount ?? 0));
    if (agentId) {
      if (!byGameAgent.has(gameId)) byGameAgent.set(gameId, new Map());
      const agentsForGame = byGameAgent.get(gameId)!;
      agentsForGame.set(agentId, (agentsForGame.get(agentId) ?? 0) + Number(item.amount ?? 0));
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">JUEGOS</p>
          <h1>Tipos de juegos y recaudación</h1>
          <p className="muted">Administrá los juegos y controlá cuánto recauda cada subagente o ambulante por código.</p>
        </div>
        <Link href="/agencias" className="button ghost">Volver a subagentes y ambulantes</Link>
      </div>

      {params.error === "solo-administrador" && <p className="message error-message">Solo el titular o administrador puede modificar el catálogo de juegos. Tu usuario no recibió ese permiso.</p>}

      <div className="stats-grid">
        <div className="stat-card"><span>Juegos activos</span><strong>{gameRows.filter((game) => game.enabled).length}</strong><small>catálogo operativo</small></div>
        <div className="stat-card"><span>Tipos registrados</span><strong>{gameRows.length}</strong><small>editables</small></div>
        <div className="stat-card"><span>Recaudación total</span><strong>{money(totalRevenue, organization.currency_code)}</strong><small>sumada de todos los juegos</small></div>
        <div className="stat-card"><span>Movimientos por juego</span><strong>{details.length}</strong><small>distribuciones registradas</small></div>
      </div>

      <section className="panel game-management-panel">
        <div className="panel-head">
          <div><h2>Catálogo editable</h2><p className="muted">Agregá, editá, activá, desactivá o eliminá tipos de juegos.</p></div>
        </div>
        {canManageGames
          ? <form action={createGameType} className="inline-form game-create-form">
              <input name="name" placeholder="Nombre del juego" required />
              <input name="category" placeholder="Categoría (Quiniela / Otros juegos)" defaultValue="Quiniela" required />
              <button className="button primary">Agregar juego</button>
            </form>
          : <p className="message">Vista de consulta: el catálogo solo puede cambiarlo el titular o un administrador autorizado de la agencia.</p>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Juego</th><th>Categoría</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {gameRows.map((game) => (
                <tr key={game.id}>
                  <td colSpan={4}>
                    {canManageGames
                      ? <form action={updateGameType} className="game-edit-row">
                          <input type="hidden" name="id" value={game.id} />
                          <input name="name" defaultValue={game.name} required />
                          <input name="category" defaultValue={game.category} required />
                          <label className="game-enabled"><input type="checkbox" name="enabled" defaultChecked={game.enabled} /> Activo</label>
                          <div className="game-actions">
                            <button className="button ghost" type="submit">Guardar</button>
                            <button className="button danger-button" formAction={deleteGameType}>Eliminar</button>
                          </div>
                        </form>
                      : <div className="game-edit-row game-readonly-row"><strong>{game.name}</strong><span>{game.category}</span><span className={game.enabled ? "badge success" : "badge"}>{game.enabled ? "Activo" : "Inactivo"}</span></div>}
                  </td>
                </tr>
              ))}
              {!gameRows.length && <tr><td colSpan={4}>No hay juegos cargados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-head">
          <div><h2>Recaudación por juego</h2><p className="muted">Total acumulado y distribución entre subagentes y ambulantes.</p></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Juego</th><th>Categoría</th><th>Recaudado</th><th>Distribución</th></tr></thead>
            <tbody>
              {gameRows.map((game) => {
                const amount = totals.get(game.id) ?? 0;
                const gameAgents = byGameAgent.get(game.id);
                return (
                  <tr key={game.id}>
                    <td><strong>{game.name}</strong>{!game.enabled && <span className="badge">Inactivo</span>}</td>
                    <td>{game.category}</td>
                    <td className="mono"><strong>{money(amount, organization.currency_code)}</strong></td>
                    <td>
                      {gameAgents && gameAgents.size ? (
                        <details className="game-breakdown-details">
                          <summary>Ver subagentes / ambulantes</summary>
                          <div className="game-agent-breakdown">
                            {Array.from(gameAgents.entries()).map(([agentId, agentAmount]) => {
                              const agent = agentById.get(agentId);
                              return <div key={agentId}><span>{agent?.kind === "ambulant" ? "Ambulante" : "Subagente"} <strong>{agent?.code ?? "—"}</strong></span><strong>{money(agentAmount, organization.currency_code)}</strong></div>;
                            })}
                          </div>
                        </details>
                      ) : <span className="muted">Sin recaudación todavía</span>}
                    </td>
                  </tr>
                );
              })}
              {!gameRows.length && <tr><td colSpan={4}>No hay tipos de juegos configurados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}