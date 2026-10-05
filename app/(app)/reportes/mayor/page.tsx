import { getCurrentContext, money } from "@/lib/accounting";

export default async function MayorPage(){
  const {supabase,organization}=await getCurrentContext();
  if(!organization) return null;
  const [{data:accounts},{data:lines}]=await Promise.all([
    supabase.from("accounts").select("id,code,name").eq("organization_id",organization.id).eq("is_active",true).order("code"),
    supabase.from("journal_lines").select("id,account_id,description,debit,credit,journal_entries!inner(entry_number,entry_date,description,organization_id,status)").eq("journal_entries.organization_id",organization.id).eq("journal_entries.status","posted").order("id",{ascending:true}).limit(500),
  ]);
  const accountMap=new Map((accounts??[]).map(a=>[a.id,a]));
  return <div className="page"><div className="topbar"><div><p className="eyebrow">REPORTE</p><h1>Libro mayor</h1><p className="muted">Movimientos detallados de las cuentas contabilizadas.</p></div></div>
    <section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Asiento</th><th>Cuenta</th><th>Descripción</th><th>Debe</th><th>Haber</th></tr></thead><tbody>{(lines??[]).map(line=>{const e=Array.isArray(line.journal_entries)?line.journal_entries[0]:line.journal_entries;const a=accountMap.get(line.account_id);return <tr key={line.id}><td>{e?.entry_date||"—"}</td><td className="mono">{e?.entry_number||"—"}</td><td>{a?a.code+" · "+a.name:"—"}</td><td>{line.description||e?.description||"—"}</td><td className="mono">{money(line.debit,organization.currency_code)}</td><td className="mono">{money(line.credit,organization.currency_code)}</td></tr>})}</tbody></table></div></section>
  </div>;
}
