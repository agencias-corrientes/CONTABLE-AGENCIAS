import { getCurrentContext } from "@/lib/accounting";
import { createPeriod } from "./actions";

export default async function PeriodosPage(){
  const {supabase,organization}=await getCurrentContext();
  if(!organization) return null;
  const {data:periods}=await supabase.from("fiscal_periods").select("id,name,start_date,end_date,status").eq("organization_id",organization.id).order("start_date",{ascending:false});
  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Períodos fiscales</h1><p className="muted">Administrá los períodos contables de {organization.name}.</p></div></div>
    <section className="panel"><div className="panel-head"><h2>Nuevo período</h2></div>
      <form action={createPeriod} className="inline-form">
        <input name="name" placeholder="2027" required />
        <input name="start_date" type="date" required />
        <input name="end_date" type="date" required />
        <button className="button primary">Crear período</button>
      </form>
    </section>
    <section className="panel table-panel"><div className="panel-head"><h2>Períodos</h2><span className="muted">{periods?.length??0} registros</span></div>
      <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead><tbody>{(periods??[]).map(p=><tr key={p.id}><td>{p.name}</td><td>{p.start_date}</td><td>{p.end_date}</td><td><span className={p.status==="open"?"badge success":"badge"}>{p.status}</span></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
