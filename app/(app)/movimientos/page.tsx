import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";
import { createCashMovement } from "./actions";

export default async function CajaPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;
  const db = supabase as any;

  const [{data:cash},{data:movements},{data:received}] = await Promise.all([
    db.from("cash_accounts").select("id,name,type,currency_code,is_active").eq("organization_id",organization.id).eq("is_active",true).order("name"),
    db.from("cash_movements").select("id,movement_date,direction,amount,description,cash_account_id,cash_accounts(name)").eq("organization_id",organization.id).order("movement_date",{ascending:false}).limit(100),
    db.from("agency_rendition_payments").select("id,payment_date,amount,reference,rendition_id,agency_renditions(agent_id,agency_agents(full_name,kind))").eq("organization_id",organization.id).order("payment_date",{ascending:false}).limit(50),
  ]);

  const balances=new Map<string,number>();
  for(const row of movements??[]) balances.set(row.cash_account_id,(balances.get(row.cash_account_id)??0)+(row.direction==="incoming"?1:-1)*Number(row.amount??0));

  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">DINERO DE LA AGENCIA</p><h1>Caja</h1><p className="muted">Control de dinero recibido de subagentes y ambulantes y de los movimientos propios de la agencia.</p></div><Link href="/rendiciones" className="button primary">Ver rendiciones</Link></div>

    <div className="stats-grid compact">
      {(cash??[]).map((account:any)=><div className="stat-card" key={account.id}><span>{account.name}</span><strong>{money(balances.get(account.id)??0,account.currency_code)}</strong><small>{account.type==="cash"?"Efectivo":account.type==="bank"?"Banco":"Cuenta digital"}</small></div>)}
      {!cash?.length?<div className="empty-state">No hay cuentas configuradas.</div>:null}
    </div>

    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Dinero recibido por rendiciones</h2><p className="muted">Cada ingreso está asociado a la persona que realizó la rendición.</p></div><Link href="/agentes" className="table-link">Ver agentes →</Link></div>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Persona</th><th>Tipo</th><th>Importe</th><th>Referencia</th></tr></thead><tbody>
        {(received??[]).map((row:any)=>{const rendition=Array.isArray(row.agency_renditions)?row.agency_renditions[0]:row.agency_renditions;const agent=Array.isArray(rendition?.agency_agents)?rendition.agency_agents[0]:rendition?.agency_agents;return <tr key={row.id}><td>{row.payment_date}</td><td><strong>{agent?.full_name||"—"}</strong></td><td>{agent?.kind==="subagent"?"Subagente":"Ambulante"}</td><td className="mono">{money(row.amount,organization.currency_code)}</td><td>{row.reference||"—"}</td></tr>})}
        {!received?.length?<tr><td colSpan={5}>Todavía no hay dinero recibido mediante rendiciones.</td></tr>:null}
      </tbody></table></div>
    </section>

    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Otros movimientos de caja</h2><p className="muted">Egresos o ingresos que pertenecen a la administración propia de la agencia.</p></div></div>
      <form action={createCashMovement} className="cash-form">
        <select name="cash_account_id" required><option value="">Cuenta</option>{(cash??[]).map((account:any)=><option key={account.id} value={account.id}>{account.name}</option>)}</select>
        <input name="movement_date" type="date" required/>
        <select name="direction" defaultValue="outgoing"><option value="outgoing">Egreso</option><option value="incoming">Ingreso</option></select>
        <input name="amount" type="number" min="0.01" step="0.01" placeholder="Importe" required/>
        <input name="description" placeholder="Motivo" required/>
        <button className="button primary">Registrar movimiento</button>
      </form>
      <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Cuenta</th><th>Descripción</th><th>Tipo</th><th>Importe</th></tr></thead><tbody>
        {(movements??[]).filter((m:any)=>!String(m.description||"").startsWith("Rendición de ")).map((row:any)=>{const account=Array.isArray(row.cash_accounts)?row.cash_accounts[0]:row.cash_accounts;return <tr key={row.id}><td>{row.movement_date}</td><td>{account?.name||"—"}</td><td>{row.description}</td><td>{row.direction==="incoming"?"Ingreso":"Egreso"}</td><td className="mono">{money(row.amount,organization.currency_code)}</td></tr>})}
      </tbody></table></div>
    </section>
  </div>;
}
