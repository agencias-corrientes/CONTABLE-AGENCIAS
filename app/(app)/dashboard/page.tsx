import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";

export default async function DashboardPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone }).format(new Date());
  const [{ data: agents }, { data: renditions }, { data: gameAmounts }] = await Promise.all([
    supabase.from("agency_agents").select("id,kind,full_name,code,is_active").eq("organization_id", organization.id).order("kind").order("code"),
    supabase.from("agency_renditions").select("id,agent_id,rendition_date,amount_due,status,agency_rendition_payments!agency_rendition_payments_rendition_id_fkey(amount)").eq("organization_id", organization.id).neq("status", "void").order("rendition_date", { ascending: false }).limit(100),
    supabase.from("agency_rendition_game_amounts").select("id,amount,game_type_id,agency_game_types(name,category)").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(500),
  ]);
  const rows=(renditions??[]).map((row)=>{const payments=Array.isArray(row.agency_rendition_payments)?row.agency_rendition_payments:[];const received=payments.reduce((sum,payment)=>sum+Number(payment.amount??0),0);return {...row,received,pending:Math.max(0,Number(row.amount_due??0)-received)};});
  const subagents=(agents??[]).filter((agent)=>agent.kind==="subagent");
  const ambulants=(agents??[]).filter((agent)=>agent.kind==="ambulant");
  const todayRows=rows.filter((row)=>row.rendition_date===today);
  const todayDue=todayRows.reduce((sum,row)=>sum+Number(row.amount_due??0),0);
  const todayReceived=todayRows.reduce((sum,row)=>sum+row.received,0);
  const todayPending=Math.max(0,todayDue-todayReceived);
  const openCount=rows.filter((row)=>row.pending>0).length;
  const gameTotals = new Map<string, { name: string; category: string; amount: number }>();
  for (const item of gameAmounts ?? []) {
    const game = Array.isArray(item.agency_game_types) ? item.agency_game_types[0] : item.agency_game_types;
    if (!game) continue;
    const current = gameTotals.get(item.game_type_id);
    gameTotals.set(item.game_type_id, {
      name: game.name,
      category: game.category,
      amount: (current?.amount ?? 0) + Number(item.amount ?? 0),
    });
  }
  const topGames = Array.from(gameTotals.values()).sort((a,b)=>b.amount-a.amount).slice(0,6);
  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">OPERACIÓN DIARIA</p><h1>Control de subagentes y ambulantes</h1><p className="muted">El código identifica a cada subagente o ambulante y concentra su rendición diaria.</p></div><Link href="/agencias" className="button primary">Administrar subagentes y ambulantes</Link></div>
    <div className="stats-grid"><div className="stat-card"><span>Subagentes</span><strong>{subagents.length}</strong><small>códigos activos</small></div><div className="stat-card"><span>Ambulantes</span><strong>{ambulants.length}</strong><small>códigos activos</small></div><div className="stat-card"><span>Rendido hoy</span><strong>{money(todayDue,organization.currency_code)}</strong><small>{todayRows.length} rendiciones del día</small></div><div className="stat-card"><span>Pendiente hoy</span><strong>{money(todayPending,organization.currency_code)}</strong><small>{openCount} rendiciones con saldo</small></div></div>
    <section className="dashboard-grid"><div className="panel large"><div className="panel-head"><div><h2>Rendiciones de hoy</h2><p className="muted">Control por código de subagente o ambulante.</p></div><Link href="/pagos" className="button ghost">Ver cobranzas</Link></div><div className="table-wrap"><table><thead><tr><th>Subagente / ambulante</th><th>Código</th><th>Importe</th><th>Cobrado</th><th>Pendiente</th><th></th></tr></thead><tbody>
      {todayRows.slice(0,12).map((row)=>{const agent=(agents??[]).find((item)=>item.id===row.agent_id);return <tr key={row.id}><td>{agent?.kind==="ambulant"?"Ambulante":"Subagente"}</td><td className="mono">{agent?.code??"—"}</td><td className="mono">{money(row.amount_due,organization.currency_code)}</td><td className="mono">{money(row.received,organization.currency_code)}</td><td className="mono">{money(row.pending,organization.currency_code)}</td><td><Link href={`/agencias/${row.agent_id}`} className="agency-enter">Abrir →</Link></td></tr>})}
      {!todayRows.length&&<tr><td colSpan={6}>No hay rendiciones cargadas para hoy.</td></tr>}
    </tbody></table></div></div>
      <div className="panel"><div className="panel-head"><div><h2>Acciones rápidas</h2><p className="muted">Operación diaria.</p></div></div><div className="quick-grid quick-grid-focus"><Link href="/agencias" className="quick-card quick-card-agencies"><strong>Agregar subagente o ambulante</strong><span>Asigná un código como 251-010-01 o 251-106-01.</span></Link><Link href="/pagos" className="quick-card"><strong>Cobrar rendición</strong><span>Registrar el cobro del subagente o ambulante.</span></Link></div><div className="check-list"><div><span>✓</span> Código operativo por subagente o ambulante</div><div><span>✓</span> Rendición diaria centralizada</div><div><span>✓</span> Saldo pendiente por código</div></div></div>
    </section>
    <section className="panel table-panel dashboard-games-panel">
      <div className="panel-head"><div><h2>Recaudación por juegos</h2><p className="muted">Total acumulado de juegos registrados en las rendiciones.</p></div><Link href="/juegos" className="button ghost">Administrar juegos</Link></div>
      <div className="dashboard-game-grid">
        {topGames.map((game)=>(
          <div className="dashboard-game-card" key={game.name}><span>{game.category}</span><strong>{game.name}</strong><em>{money(game.amount,organization.currency_code)}</em><small>recaudado por subagentes y ambulantes</small></div>
        ))}
        {!topGames.length&&<div className="empty-state">Todavía no hay recaudación distribuida por juegos.</div>}
      </div>
    </section>
  </div>;
}