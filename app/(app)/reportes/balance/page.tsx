import { getCurrentContext, money } from "@/lib/accounting";

export default async function BalancePage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id,code,name,type")
    .eq("organization_id", organization.id)
    .order("code");

  const { data: lines } = await supabase
    .from("journal_lines")
    .select("account_id,debit,credit,journal_entries!inner(organization_id,status)")
    .eq("journal_entries.organization_id", organization.id)
    .eq("journal_entries.status", "posted");

  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of lines ?? []) {
    const current = totals.get(line.account_id) ?? { debit: 0, credit: 0 };
    current.debit += Number(line.debit ?? 0);
    current.credit += Number(line.credit ?? 0);
    totals.set(line.account_id, current);
  }

  return (
    <div className="page">
      <div className="topbar"><div><p className="eyebrow">REPORTE</p><h1>Balance de sumas y saldos</h1><p className="muted">Solo se consideran asientos contabilizados.</p></div></div>
      <section className="panel table-panel">
        <div className="table-wrap"><table><thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr></thead>
        <tbody>{(accounts ?? []).map((account)=>{const t=totals.get(account.id)??{debit:0,credit:0};const balance=t.debit-t.credit;return <tr key={account.id}><td className="mono">{account.code}</td><td>{account.name}</td><td>{account.type}</td><td className="mono">{money(t.debit,organization.currency_code)}</td><td className="mono">{money(t.credit,organization.currency_code)}</td><td className="mono">{money(balance,organization.currency_code)}</td></tr>})}</tbody></table></div>
      </section>
    </div>
  );
}
