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
    <div className="topbar"><div><p className="eyebrow">SEGURIDAD</p><h1>Usuarios y roles</h1><p className="muted">Administrá las cuentas que tienen acceso a {organization.name}. Los cambios de rol se aplican únicamente a esta agencia. Guardar un rol no requiere contraseña; el campo de contraseña se usa solamente para confirmar una baja.</p></div></div>
    {params.resultado==="rol-guardado" && <p className="message success-message">El rol del usuario se actualizó correctamente.</p>}
    {params.resultado==="usuario-eliminado" && <p className="message success-message">El acceso del usuario a esta agencia fue eliminado.</p>}
    {params.error && <p className="message error-message">{({
      "contrasena-incorrecta":"La contraseña no coincide. No se eliminó ningún acceso.",
      "sin-permiso-eliminar":"No se puede quitar ese usuario con los permisos actuales.",
      "solo-titular":"Solo el titular actual puede cambiar roles o quitar accesos.",
      "debe-quedar-un-titular":"No se puede quitar el último titular. Asigná primero Propietario a otra cuenta.",
      "permisos-supabase-pendientes":"Supabase todavía no tiene aplicado el permiso interno necesario para cambiar roles. No se modificó ningún rol.",
      "funcion-remocion-pendiente":"Supabase todavía no tiene aplicada la función segura de eliminación. No se quitó ningún acceso.",
      "no-cambiar-rol-propio":"No podés cambiar tu propio rol desde esta fila. Asigná primero Propietario a otra cuenta.",
      "datos-rol-invalidos":"Seleccioná un rol válido e intentá otra vez.",
      "rol-no-guardado":"No se pudo guardar el rol. No se modificaron los accesos.",
      "usuario-no-encontrado":"El usuario ya no pertenece a esta agencia.",
      "datos-invalidos":"Falta el usuario o la contraseña de confirmación.",
      "verificacion-fallida":"No se pudo verificar la cuenta actual. No se eliminó ningún acceso.",
      "eliminacion-fallida":"No se pudo quitar el acceso. No se modificaron los datos."
    } as Record<string,string>)[params.error] ?? "No se pudo completar la operación. No se modificaron los datos."}</p>}
    <section className="panel table-panel"><div className="panel-head"><h2>Miembros</h2><span className="muted">{members?.length??0} usuarios</span></div>
      <div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Teléfono</th><th>Rol</th><th>Alta</th><th>Guardar</th><th>Eliminar acceso</th></tr></thead><tbody>{(members??[]).map(m=>{const p=byId.get(m.user_id);return <tr key={m.user_id}><td>{p?.full_name||m.user_id.slice(0,8)+"…"}</td><td>{p?.phone||"—"}</td><td>{roleLabels[m.role]}</td><td>{new Date(m.created_at).toLocaleDateString("es-AR")}</td><td>{m.user_id===userId ? <strong>{roleLabels[m.role]}</strong> : <form action={setMemberRole} className="inline-action"><input type="hidden" name="user_id" value={m.user_id}/><select name="role" defaultValue={m.role} aria-label={"Rol de "+(p?.full_name||"usuario")}><option value="owner">Propietario</option><option value="admin">Administrador</option><option value="accountant">Contador</option><option value="viewer">Consulta</option></select><button className="button ghost" type="submit">Guardar rol</button></form>}</td><td>{member?.role==="owner" ? <form action={removeOrganizationMember} className="remove-member-form"><input type="hidden" name="user_id" value={m.user_id}/><input type="password" name="password" autoComplete="current-password" placeholder="Tu contraseña" required minLength={1} aria-label={"Contraseña para quitar a "+(p?.full_name||"este usuario")}/><button className="button danger small" type="submit">Eliminar</button></form> : <span className="muted">Solo titular</span>}</td></tr>})}</tbody></table></div>
    </section>
  </div>;
}
