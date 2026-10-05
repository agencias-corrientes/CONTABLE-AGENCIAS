import { getCurrentContext, money } from "@/lib/accounting";

export default async function PatrimonialPage(){
  const {supabase,organization}=await getCurrentContext();
  if(!organization) return null;
  const [{data:accounts},{data:lines}]=await Promise.all([
    supabase.from("accounts").select("id,code,name,type").eq("organization_id",organization.id).in("type",["asset","liability","equity"]).eq("is_active",true).order("code"),
    supabase.from("journal_lines").select("account_id,debit,credit,journal_entries!inner(organization_id,status)").eq("journal_entries.organization_id",organization.id).eq("journal_entries.status","posted"),
  ]);
  const totals=new Map<string,{debit:number;credit:number}>();
  for(const line of lines??[]){const t=totals.get(line.account_id)??{debit:0,credit:0};t.debit+=Number(line.debit??0);t.credit+=Number(line.credit??0);totals.set(line.account_id,t);}
  let assets=0,liabilities=0,equity=0;
  for(const a of accounts??[]){const t=totals.get(a.id)??{debit:0,credit:0};const balance=a.type==="asset"?t.debit-t.credit:t.credit-t.debit;if(a.type==="asset")assets+=balance;else if(a.type==="liability")liabilities+=balance;else equity+=balance;}
  return <div className="page"><div className="topbar"><div><p className="eyebrow">REPORTE</p><h1>Situación patrimonial</h1><p className="muted">Activo, pasivo y patrimonio neto de los movimientos publicados.</p></div></div>
    <div className="stats-grid"><div className="stat-card"><span>Activo</span><strong>{money(assets,organization.currency_code)}</strong><small>total</small></div><div className="stat-card"><span>Pasivo</span><strong>{money(liabilities,organization.currency_code)}</strong><small>total</small></div><div className="stat-card"><span>Patrimonio neto</span><strong>{money(equity,organization.currency_code)}</strong><small>total</small></div><div className="stat-card"><span>Control</span><strong>{money(assets-liabilities-equity,organization.currency_code)}</strong><small>debe tender a cero</small></div></div>
    <section className="panel table-panel"><div className="panel-head"><h2>Detalle por cuenta</h2></div><div className="table-wrap"><table><thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th>Saldo</th></tr></thead><tbody>{(accounts??[]).map(a=>{const t=totals.get(a.id)??{debit:0,credit:0};const balance=a.type==="asset"?t.debit-t.credit:t.credit-t.debit;return <tr key={a.id}><td className="mono">{a.code}</td><td>{a.name}</td><td>{a.type}</td><td className="mono">{money(balance,organization.currency_code)}</td></tr>})}</tbody></table></div></section>
  </div>;
}
