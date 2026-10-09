import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { OFFICIAL_AGENCY_GAME_CATALOG, getOfficialAgencyGame } from "@/lib/agency-official-games";
import { createGameType, deleteGameType, updateGameType, saveDefaultGameCommissions } from "./actions";

type Breakdown = {
  id: string;
  amount: number | string;
  game_type_id: string;
  agency_game_types: { id: string; name: string; category: string } | null;
  agency_renditions: { agent_id: string; rendition_date: string; status: string } | null;
};

export default async function GamesPage({ searchParams }: { searchParams?: Promise<{ error?: string; resultado?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const { supabase, organization, member } = await getCurrentContext();
  if (!organization || !member) return null;
  const canManageGames = member.role === "owner";

  const [{ data: games }, { data: breakdowns }, { data: agents }, { data: defaultCommissionRows }] = await Promise.all([
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
    supabase.from("agency_game_commission_defaults").select("game_type_id,commission_percent").eq("organization_id", organization.id),
  ]);

  const gameRows = games ?? [];
  const gameCatalog = OFFICIAL_AGENCY_GAME_CATALOG;
  const missingOfficialGames = gameCatalog.filter((entry) => !gameRows.some((game) => game.name.trim().toLocaleUpperCase("es-AR") === entry.name.toLocaleUpperCase("es-AR")));
  const agentRows = agents ?? [];
  const details = (breakdowns ?? []) as Breakdown[];
  const generalCommissionByGame = new Map((defaultCommissionRows ?? []).map((row) => [row.game_type_id, Number(row.commission_percent ?? 0)]));

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

      {params.error === "solo-administrador" && <p className="message error-message">Solo el titular de la agencia puede modificar el catálogo o las comisiones generales.</p>}
      {params.error === "juego-no-oficial" && <p className="message error-message">Solo se pueden agregar o activar juegos publicados en el catálogo oficial de Lotería Correntina.</p>}
      {params.error === "juego-existente" && <p className="message">Ese juego oficial ya está cargado. Activá su registro en el catálogo en lugar de duplicarlo.</p>}
      {params.error === "comisiones-generales-invalidas" && <p className="message error-message">Cada comisión general debe estar entre 0 y 100 %.</p>}
      {params.error === "comisiones-generales-no-guardadas" && <p className="message error-message">No se guardaron los porcentajes generales. No se aplicaron cambios.</p>}
      {params.resultado === "comisiones-generales-guardadas" && <p className="message success-message">Comisiones generales guardadas. Los próximos registros usarán estos porcentajes, salvo que un subagente o ambulante tenga una excepción particular.</p>}

      <div className="stats-grid">
        <div className="stat-card"><span>Juegos activos</span><strong>{gameRows.filter((game) => game.enabled).length}</strong><small>catálogo operativo</small></div>
        <div className="stat-card"><span>Tipos registrados</span><strong>{gameRows.length}</strong><small>editables</small></div>
        <div className="stat-card"><span>Recaudación total</span><strong>{money(totalRevenue, organization.currency_code)}</strong><small>sumada de todos los juegos</small></div>
        <div className="stat-card"><span>Movimientos por juego</span><strong>{details.length}</strong><small>distribuciones registradas</small></div>
      </div>

      <section id="comision-general" className="panel agent-commission-panel general-commission-panel">
        <div className="panel-head">
          <div><h2>Comisión general para todos los subagentes y ambulantes</h2><p className="muted">Configurá el porcentaje habitual para cada juego. Este valor se usa automáticamente cuando el operador no tiene una excepción particular.</p></div>
          <span className={canManageGames ? "badge success" : "badge"}>{canManageGames ? "Editable por titular" : "Solo consulta"}</span>
        </div>
        {canManageGames ? <form action={saveDefaultGameCommissions} className="agent-commission-form">
          <div className="agent-commission-list">
            {gameRows.map((game) => <label className="agent-commission-row" key={game.id}>
              <span><strong>{game.name}</strong><small>{game.category}{game.enabled ? "" : " · Inactivo"}</small></span>
              <span className="commission-percent-input"><input type="number" name={"default_commission_" + game.id} min="0" max="100" step="0.01" inputMode="decimal" defaultValue={(generalCommissionByGame.get(game.id) ?? 0).toFixed(2)} aria-label={"Comisión general de " + game.name} /><em>%</em></span>
            </label>)}
          </div>
          <p className="muted small-text">Se aplicará a todos los operadores por igual, salvo que configures una excepción en la ficha del subagente o ambulante. 0 % también es un valor válido.</p>
          <button className="button primary" type="submit">Guardar comisiones generales</button>
        </form> : <div className="agent-commission-list">
          {gameRows.map((game) => <div className="agent-commission-row" key={game.id}><span><strong>{game.name}</strong><small>{game.category}</small></span><strong>{(generalCommissionByGame.get(game.id) ?? 0).toFixed(2)} %</strong></div>)}
        </div>}
      </section>

      <section className="panel game-management-panel">
        <div className="panel-head">
          <div><h2>Catálogo oficial de juegos</h2><p className="muted">Solo se pueden habilitar juegos que figuran en las publicaciones oficiales. Los registros antiguos fuera del catálogo se conservan para consultar el historial, pero no se pueden usar en nuevas rendiciones.</p></div>
        </div>
        {canManageGames && missingOfficialGames.length > 0
          ? <form action={createGameType} className="inline-form game-create-form">
              <select name="name" defaultValue={missingOfficialGames[0]?.name ?? ""} required aria-label="Juego oficial para agregar">
                {missingOfficialGames.map((game) => <option key={game.name} value={game.name}>{game.name}{game.type === "special" ? " · especial oficial" : ""}</option>)}
              </select>
              <button className="button primary">Agregar juego oficial</button>
            </form>
          : canManageGames
            ? <p className="message">El catálogo ya contiene todos los juegos oficiales identificados. Para habilitar uno, activá su registro en la lista.</p>
            : <p className="message">Vista de consulta: el catálogo solo puede cambiarlo el titular de la agencia.</p>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Juego</th><th>Categoría</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {gameRows.map((game) => {
                const officialEntry = getOfficialAgencyGame(game.name);
                return <tr key={game.id}>
                  <td colSpan={4}>
                    {canManageGames && officialEntry
                      ? <form action={updateGameType} className="game-edit-row">
                          <input type="hidden" name="id" value={game.id} />
                          <input type="hidden" name="name" value={officialEntry.name} />
                          <span><strong>{officialEntry.name}</strong><small>{officialEntry.type === "special" ? "Evento especial oficial" : officialEntry.category}</small></span>
                          <label className="game-enabled"><input type="checkbox" name="enabled" defaultChecked={game.enabled} /> Activo</label>
                          <div className="game-actions">
                            <button className="button ghost" type="submit">Guardar estado</button>
                            <button className="button danger-button" formAction={deleteGameType}>Eliminar</button>
                          </div>
                        </form>
                      : <div className="game-edit-row game-readonly-row"><strong>{game.name}</strong><span>{game.category}</span><span className={officialEntry && game.enabled ? "badge success" : "badge"}>{officialEntry ? (game.enabled ? "Activo" : "Inactivo") : "Fuera del catálogo oficial · sólo historial"}</span></div>}
                  </td>
                </tr>;
              })}
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