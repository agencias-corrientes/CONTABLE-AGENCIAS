import { getCurrentContext, money } from "@/lib/accounting";

export default async function ResultadosPage(){
  const {supabase,organization}=await getCurrentContext();
  if(!organization) return null;
  const [{data:accounts},{data:lines}]=await Promise.all([
    supabase.from("accounts").select("id,code,name,type").eq("organization_id",organization.id).in("type",["income","expense"]).eq("is_active",true).order("code"),
    supabase.from("journal_lines").select("account_id,debit,credit,journal_entries!inner(organization_id,status)").eq("journal_entries.organization_id",organization.id).eq("journal_entries.status","posted"),
  ]);
  const totals=new Map<string,{debit:number;credit:number}>();
  for(const line of lines??[]){const t=totals.get(line.account_id)??{debit:0,credit:0};t.debit+=Number(line.debit??0);t.credit+=Number(line.credit??0);totals.set(line.account_id,t);}
  let income=0,expense=0;
  for(const a of accounts??[]){const t=totals.get(a.id)??{debit:0,credit:0};if(a.type==="income")income+=t.credit-t.debit;else expense+=t.debit-t.credit;}
  return <div className="page"><div className="topbar"><div><p className="eyebrow">REPORTE</p><h1>Estado de resultados</h1><p className="muted">Calculado sobre asientos contabilizados.</p></div></div>
    <div className="stats-grid"><div className="stat-card"><span>Ingresos</span><strong>{money(income,organization.currency_code)}</strong><small>acumulados</small></div><div className="stat-card"><span>Egresos</span><strong>{money(expense,organization.currency_code)}</strong><small>acumulados</small></div><div className="stat-card"><span>Resultado</span><strong>{money(income-expense,organization.currency_code)}</strong><small>{income-expense>=0?"positivo":"negativo"}</small></div></div>
    <section className="panel table-panel"><div className="panel-head"><h2>Detalle por cuenta</h2></div><div className="table-wrap"><table><thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th>Saldo</th></tr></thead><tbody>{(accounts??[]).map(a=>{const t=totals.get(a.id)??{debit:0,credit:0};const balance=a.type==="income"?t.credit-t.debit:t.debit-t.credit;return <tr key={a.id}><td className="mono">{a.code}</td><td>{a.name}</td><td>{a.type==="income"?"Ingreso":"Egreso"}</td><td className="mono">{money(balance,organization.currency_code)}</td></tr>})}</tbody></table></div></section>
  </div>;
}
