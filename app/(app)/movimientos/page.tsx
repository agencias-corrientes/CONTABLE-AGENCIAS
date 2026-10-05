import { getCurrentContext, money } from "@/lib/accounting";
import { createCashMovement } from "./actions";

export default async function MovimientosPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const [cash, movements] = await Promise.all([
    supabase.from("cash_accounts").select("id,name,type,currency_code,is_active").eq("organization_id", organization.id).eq("is_active", true).order("name"),
    supabase.from("cash_movements").select("id,movement_date,direction,amount,description,cash_accounts(name)").eq("organization_id", organization.id).order("movement_date", { ascending: false }).limit(100),
  ]);

  return (
    <div className="page">
      <div className="topbar"><div><p className="eyebrow">TESORERÍA</p><h1>Caja y bancos</h1><p className="muted">Control de cuentas y movimientos de fondos.</p></div></div>

      <section className="panel">
        <div className="panel-head"><h2>Nuevo movimiento</h2></div>
        <form action={createCashMovement} className="inline-form wrap">
          <select name="cash_account_id" required><option value="">Cuenta</option>{(cash.data ?? []).map((account)=><option key={account.id} value={account.id}>{account.name}</option>)}</select>
          <input name="movement_date" type="date" required />
          <select name="direction" defaultValue="incoming"><option value="incoming">Ingreso</option><option value="outgoing">Egreso</option></select>
          <input name="amount" type="number" min="0.01" step="0.01" placeholder="Importe" required />
          <input name="description" placeholder="Descripción" required />
          <button className="button primary">Registrar movimiento</button>
        </form>
      </section>

      <div className="stats-grid compact">
        {(cash.data ?? []).map((account) => <div className="stat-card" key={account.id}><span>{account.name}</span><strong>{money(0, account.currency_code)}</strong><small>{account.type}</small></div>)}
      </div>

      <section className="panel table-panel"><div className="panel-head"><h2>Últimos movimientos</h2><span className="muted">{movements.data?.length ?? 0} registros</span></div>
        <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Cuenta</th><th>Descripción</th><th>Dirección</th><th>Importe</th></tr></thead><tbody>{(movements.data ?? []).map((row)=>{const account=Array.isArray(row.cash_accounts)?row.cash_accounts[0]:row.cash_accounts;return <tr key={row.id}><td>{row.movement_date}</td><td>{account?.name||"—"}</td><td>{row.description}</td><td>{row.direction==="incoming"?"Ingreso":"Egreso"}</td><td className="mono">{money(row.amount,organization.currency_code)}</td></tr>})}</tbody></table></div>
      </section>
    </div>
  );
}
