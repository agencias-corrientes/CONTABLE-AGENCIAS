import { getCurrentContext } from "@/lib/accounting";
import { removeOrganizationMember, setMemberRole } from "./actions";

const roleLabels={owner:"Propietario",admin:"Administrador",accountant:"Contador",viewer:"Consulta"} as const;

export default async function UsuariosPage({searchParams}:{searchParams?:Promise<{error?:string;resultado?:string}>}){
  const {supabase,organization,member,userId}=await getCurrentContext();
  if(!organization) return null;
  const {data:members}=await supabase.from("organization_members").select("organization_id,user_id,role,created_at").eq("organization_id",organization.id).order("created_at");
  const ids=(members??[]).map(m=>m.user_id);
  const {data:profiles}=ids.length?await supabase.from("profiles").select("id,full_name,phone").in("id",ids):{data:[]};
  const byId=new Map((profiles??[]).map(p=>[p.id,p]));
  const params = searchParams ? await searchParams : {};
  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">SEGURIDAD</p><h1>Usuarios y roles</h1><p className="muted">Controlá los roles y quitá el acceso a usuarios de {organization.name}. Para confirmar la eliminación se solicita tu contraseña actual. Esto desvincula el usuario de esta agencia; no elimina su cuenta global de inicio de sesión.</p></div></div>
    {params.error==="contrasena-incorrecta" && <p className="message error-message">La contraseña no coincide. No se eliminó ningún acceso.</p>}
    {params.error==="sin-permiso-eliminar" && <p className="message error-message">No se puede quitar ese usuario. Si es el único titular, primero asigná otro titular.</p>}
    {params.error && !["contrasena-incorrecta","sin-permiso-eliminar"].includes(params.error) && <p className="message error-message">No se pudo quitar el acceso. No se modificaron los datos.</p>}
    {params.resultado==="usuario-eliminado" && <p className="message success-message">El acceso del usuario a esta agencia fue eliminado.</p>}
    <section className="panel table-panel"><div className="panel-head"><h2>Miembros</h2><span className="muted">{members?.length??0} usuarios</span></div>
      <div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Teléfono</th><th>Rol</th><th>Alta</th><th>Guardar</th><th>Eliminar acceso</th></tr></thead><tbody>{(members??[]).map(m=>{const p=byId.get(m.user_id);return <tr key={m.user_id}><td>{p?.full_name||m.user_id.slice(0,8)+"…"}</td><td>{p?.phone||"—"}</td><td>{roleLabels[m.role]}</td><td>{new Date(m.created_at).toLocaleDateString("es-AR")}</td><td><form action={setMemberRole} className="inline-action"><input type="hidden" name="user_id" value={m.user_id}/><select name="role" defaultValue={m.role}><option value="owner">Propietario</option><option value="admin">Administrador</option><option value="accountant">Contador</option><option value="viewer">Consulta</option></select><button className="button ghost">Guardar</button></form></td><td>{member?.role==="owner" ? <form action={removeOrganizationMember} className="remove-member-form"><input type="hidden" name="user_id" value={m.user_id}/><input type="password" name="password" autoComplete="current-password" placeholder="Tu contraseña" required minLength={1} aria-label={"Contraseña para quitar a "+(p?.full_name||"este usuario")}/><button className="button danger small" type="submit">Eliminar</button></form> : <span className="muted">Solo titular</span>}</td></tr>})}</tbody></table></div>
    </section>
  </div>;
}
