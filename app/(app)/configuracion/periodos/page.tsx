import { getCurrentContext } from "@/lib/accounting";
import { formatAgencyDate } from "@/lib/agency-datetime";
import { createPeriod } from "./actions";

export default async function PeriodosPage({searchParams}:{searchParams?:Promise<{error?:string}>}){
  const params=searchParams?await searchParams:{};
  const {supabase,organization}=await getCurrentContext();
  if(!organization) return null;
  const {data:periods}=await supabase.from("fiscal_periods").select("id,name,start_date,end_date,status").eq("organization_id",organization.id).order("start_date",{ascending:false});
  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Períodos fiscales</h1><p className="muted">Administrá los períodos contables de {organization.name}.</p></div></div>
    {params.error==="fecha-invalida" && <p className="message error-message">Ingresá ambas fechas como DD/MM/AAAA y verificá que Inicio no sea posterior a Fin.</p>}
    <section className="panel"><div className="panel-head"><h2>Nuevo período</h2></div>
      <form action={createPeriod} className="fiscal-period-form">
        <label>Nombre del período<input name="name" placeholder="2027" required /></label>
        <label>Fecha de inicio<input name="start_date" type="text" inputMode="numeric" placeholder="DD/MM/AAAA" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" maxLength={10} autoComplete="off" required /></label>
        <label>Fecha de fin<input name="end_date" type="text" inputMode="numeric" placeholder="DD/MM/AAAA" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" maxLength={10} autoComplete="off" required /></label>
        <button className="button primary" type="submit">Crear período</button>
      </form>
    </section>
    <section className="panel table-panel"><div className="panel-head"><h2>Períodos</h2><span className="muted">{periods?.length??0} registros</span></div>
      <div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead><tbody>{(periods??[]).map(p=><tr key={p.id}><td>{p.name}</td><td>{formatAgencyDate(p.start_date)}</td><td>{formatAgencyDate(p.end_date)}</td><td><span className={p.status==="open"?"badge success":"badge"}>{p.status}</span></td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
