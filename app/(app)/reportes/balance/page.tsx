import { getCurrentContext } from "@/lib/accounting";
export default async function BalancePage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;
  const { data: accounts } = await supabase.from("accounts").select("id,code,name,type").eq("organization_id", organization.id).order("code");
  return <div className="page"><div className="topbar"><div><p className="eyebrow">REPORTE</p><h1>Balance de sumas y saldos</h1><p className="muted">Estructura de cuentas preparada para calcular débitos, créditos y saldos.</p></div></div><section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Código</th><th>Cuenta</th><th>Tipo</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr></thead><tbody>{(accounts ?? []).map((account) => <tr key={account.id}><td className="mono">{account.code}</td><td>{account.name}</td><td>{account.type}</td><td className="mono">0,00</td><td className="mono">0,00</td><td className="mono">0,00</td></tr>)}</tbody></table></div></section></div>;
}
