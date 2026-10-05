import { getCurrentContext } from "@/lib/accounting";
export default async function DiarioPage() {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) return null;
  const { data: entries } = await supabase.from("journal_entries").select("id,entry_number,entry_date,description,status").eq("organization_id", organization.id).order("entry_date", { ascending: false }).order("entry_number", { ascending: false }).limit(200);
  return <div className="page"><div className="topbar"><div><p className="eyebrow">REPORTE</p><h1>Libro diario</h1><p className="muted">Listado cronológico de asientos.</p></div></div><section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>N°</th><th>Fecha</th><th>Descripción</th><th>Estado</th></tr></thead><tbody>{(entries ?? []).map((entry) => <tr key={entry.id}><td className="mono">{entry.entry_number}</td><td>{entry.entry_date}</td><td>{entry.description}</td><td>{entry.status}</td></tr>)}</tbody></table></div></section></div>;
}
