import { getCurrentContext } from "@/lib/accounting";
import { setMemberRole } from "./actions";

const roleLabels={owner:"Propietario",admin:"Administrador",accountant:"Contador",viewer:"Consulta"} as const;

export default async function UsuariosPage(){
  const {supabase,organization}=await getCurrentContext();
  if(!organization) return null;
  const {data:members}=await supabase.from("organization_members").select("organization_id,user_id,role,created_at").eq("organization_id",organization.id).order("created_at");
  const ids=(members??[]).map(m=>m.user_id);
  const {data:profiles}=ids.length?await supabase.from("profiles").select("id,full_name,phone").in("id",ids):{data:[]};
  const byId=new Map((profiles??[]).map(p=>[p.id,p]));
  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">SEGURIDAD</p><h1>Usuarios y roles</h1><p className="muted">Controlá qué puede hacer cada integrante de {organization.name}.</p></div></div>
    <section className="panel table-panel"><div className="panel-head"><h2>Miembros</h2><span className="muted">{members?.length??0} usuarios</span></div>
      <div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Teléfono</th><th>Rol</th><th>Alta</th><th>Guardar</th></tr></thead><tbody>{(members??[]).map(m=>{const p=byId.get(m.user_id);return <tr key={m.user_id}><td>{p?.full_name||m.user_id.slice(0,8)+"…"}</td><td>{p?.phone||"—"}</td><td>{roleLabels[m.role]}</td><td>{new Date(m.created_at).toLocaleDateString("es-AR")}</td><td><form action={setMemberRole} className="inline-action"><input type="hidden" name="user_id" value={m.user_id}/><select name="role" defaultValue={m.role}><option value="owner">Propietario</option><option value="admin">Administrador</option><option value="accountant">Contador</option><option value="viewer">Consulta</option></select><button className="button ghost">Guardar</button></form></td></tr>})}</tbody></table></div>
    </section>
  </div>;
}
