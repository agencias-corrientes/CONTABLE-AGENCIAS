import Link from "next/link";
import { getCurrentContext, money } from "@/lib/accounting";

export default async function ReportesPage(){
 const {supabase:rawSupabase,organization}=await getCurrentContext();
 const supabase:any=rawSupabase;
 if(!organization)return null;
 const id=organization.id;
 const [a,r,p,c]=await Promise.all([
  supabase.from("agency_agents").select("id,kind,is_active").eq("organization_id",id),
  supabase.from("agency_renditions").select("id,agent_id,amount_due,status,rendition_date").eq("organization_id",id).neq("status","void"),
  supabase.from("agency_rendition_payments").select("amount,payment_date").eq("organization_id",id),
  supabase.from("cash_movements").select("direction,amount,movement_date").eq("organization_id",id)
 ]);
 const due=(r.data??[]).reduce((s,x)=>s+Number(x.amount_due),0);
 const received=(p.data??[]).reduce((s,x)=>s+Number(x.amount),0);
 const cash=(c.data??[]).reduce((s,x)=>s+(x.direction==="incoming"?1:-1)*Number(x.amount),0);
 const open=(r.data??[]).filter(x=>x.status==="open").length;

 return <div className="page">
  <div className="topbar"><div><p className="eyebrow">INFORMACIÓN DE AGENCIA</p><h1>Reportes</h1><p className="muted">Los números que necesita el agente oficial para controlar la operación.</p></div></div>
  <div className="stats-grid"><div className="stat-card"><span>Operadores activos</span><strong>{(a.data??[]).filter(x=>x.is_active).length}</strong><small>subagentes + ambulantes</small></div><div className="stat-card"><span>Total a rendir</span><strong>{money(due,organization.currency_code)}</strong><small>rendiciones registradas</small></div><div className="stat-card"><span>Total recibido</span><strong>{money(received,organization.currency_code)}</strong><small>entregas registradas</small></div><div className="stat-card"><span>Saldo de caja</span><strong>{money(cash,organization.currency_code)}</strong><small>movimientos</small></div></div>
  <div className="report-grid">
   <Link href="/agencia/rendiciones" className="report-card"><strong>Rendiciones</strong><span>{open} rendiciones abiertas y todo el historial.</span><em>→</em></Link>
   <Link href="/agencia/cierre" className="report-card"><strong>Cierre diario</strong><span>Esperado, recibido, pendiente y caja por jornada.</span><em>→</em></Link>
   <Link href="/agencia" className="report-card"><strong>Operadores</strong><span>Acceso a cada ficha de subagente y ambulante.</span><em>→</em></Link>
   <Link href="/movimientos" className="report-card"><strong>Caja</strong><span>Todos los ingresos y egresos registrados.</span><em>→</em></Link>
  </div>
 </div>;
}