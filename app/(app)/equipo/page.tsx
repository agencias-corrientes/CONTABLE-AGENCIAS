import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";
import { addEmployeeByEmail, removeEmployeeAccess, saveEmployeePermissions } from "./actions";

const permissionLabels = [
  ["can_create_agents", "Dar de alta subagentes o ambulantes"],
  ["can_delete_agents", "Eliminar agentes sin rendiciones históricas"],
  ["can_create_renditions", "Registrar rendiciones diarias"],
  ["can_edit_renditions", "Corregir rendiciones"],
  ["can_delete_renditions", "Anular rendiciones sin cobros"],
  ["can_register_payments", "Registrar cobros en Caja"],
  ["can_manage_backups", "Administrar configuración de backups"],
] as const;

export default async function TeamPermissionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; resultado?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, organization, member } = await getCurrentContext();
  if (!organization || !member) return null;

  if (member.role !== "owner") {
    return <div className="page">
      <div className="topbar"><div><p className="eyebrow">SEGURIDAD</p><h1>Personal y permisos</h1><p className="muted">La administración de usuarios y permisos es exclusiva del titular de la agencia.</p></div></div>
      <section className="panel"><h2>Acceso restringido</h2><p className="muted">Solicitá al titular que te asigne los permisos necesarios. No podés cambiar permisos, cuentas de acceso ni configuración de seguridad.</p><Link href="/dashboard" className="button ghost">Volver al inicio</Link></section>
    </div>;
  }

  const { data: employees, error: employeeError } = await supabase.rpc("list_organization_members_for_owner", {
    p_organization_id: organization.id,
  });
  const errorMessages: Record<string, string> = {
    "solo-titular": "Solo el titular de la agencia puede administrar empleados y permisos.",
    "email-invalido": "Ingresá un correo válido.",
    "cuenta-no-registrada": "El empleado primero debe crear su cuenta de acceso con ese correo y luego podrás vincularlo a la agencia.",
    "empleado-existente": "Ese usuario ya tiene acceso a esta agencia.",
    "alta-empleado-fallida": "No se pudo agregar al empleado.",
    "usuario-invalido": "La operación solicitada no es válida.",
    "usuario-no-encontrado": "No encontramos al empleado dentro de esta agencia.",
    "no-se-puede-modificar-titular": "La cuenta del titular no se puede modificar ni revocar desde esta pantalla.",
    "permisos-no-guardados": "No se pudieron guardar los permisos. No se aplicaron cambios.",
    "acceso-no-revocado": "No se pudo revocar el acceso del empleado.",
  };

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">SEGURIDAD DE LA AGENCIA</p><h1>Personal y permisos</h1><p className="muted">El titular decide a qué módulos puede entrar cada empleado y qué operaciones puede realizar.</p></div>
        <span className="badge success">Titular</span>
      </div>
      {params.resultado === "empleado-agregado" && <p className="message success-message">Empleado agregado. Por seguridad, sus permisos quedan desactivados hasta que los habilites.</p>}
      {params.resultado === "permisos-guardados" && <p className="message success-message">Permisos guardados correctamente.</p>}
      {params.resultado === "acceso-revocado" && <p className="message success-message">Se revocó el acceso del empleado a esta agencia. Su cuenta general de autenticación no fue eliminada.</p>}
      {params.error && <p className="message error-message">{errorMessages[params.error] ?? "No se pudo completar la operación. Revisá los datos e intentá nuevamente."}</p>}

      <section className="panel">
        <div className="panel-head"><div><h2>Agregar empleado</h2><p className="muted">El empleado debe registrarse primero con su propio correo; luego vinculás esa cuenta a esta agencia.</p></div></div>
        <form action={addEmployeeByEmail} className="inline-form team-add-form">
          <input type="email" name="email" placeholder="correo@empleado.com" required autoComplete="email" />
          <button className="button primary" type="submit">Vincular empleado</button>
        </form>
      </section>

      <section className="panel team-permissions-panel">
        <div className="panel-head"><div><h2>Accesos y autorizaciones</h2><p className="muted">Cada empleado comienza con todos los permisos operativos desactivados.</p></div><span className="muted">{employees?.length ?? 0} cuentas</span></div>
        {employeeError && <p className="message error-message">No se pudo consultar la lista de empleados.</p>}
        {!employeeError && (!employees || !employees.length) && <p className="muted">Todavía no hay empleados vinculados a la agencia.</p>}
        <div className="team-member-list">
          {(employees ?? []).map((employee) => {
            const isOwner = employee.role === "owner";
            const isAdmin = employee.role === "admin";
            return <article className="team-member-card" key={employee.user_id}>
              <div className="team-member-header">
                <div><h3>{employee.full_name || employee.email}</h3><p className="muted">{employee.email}</p></div>
                <span className={"badge " + (isOwner ? "success" : "")}>{isOwner ? "Titular" : isAdmin ? "Administrador" : "Empleado"}</span>
              </div>
              {isOwner ? <p className="muted">Cuenta principal de la agencia. Su acceso no se modifica desde esta lista.</p> : isAdmin ? <p className="message">Esta cuenta tiene el rol de administrador y conserva privilegios amplios. Para aplicar restricciones por tarea debe utilizar el rol de empleado.</p> : <>
                <form action={saveEmployeePermissions} className="team-permissions-form">
                  <input type="hidden" name="user_id" value={employee.user_id} />
                  <h4>Permisos habilitados</h4>
                  <div className="team-permission-grid">
                    {permissionLabels.map(([name, label]) => <label key={name} className="team-permission-option"><input type="checkbox" name={name} defaultChecked={employee[name]} /><span>{label}</span></label>)}
                  </div>
                  <p className="team-security-note">El catálogo de juegos y sus valores no se incluyen en los permisos de empleados. Solo el titular o un administrador puede cambiar el catálogo/precios.</p>
                  <button className="button primary" type="submit">Guardar permisos</button>
                </form>
                <details className="team-remove-access">
                  <summary>Revocar acceso de este empleado</summary>
                  <p>Esto quita su membresía y sus permisos en esta agencia, pero no borra su cuenta general ni los registros históricos.</p>
                  <form action={removeEmployeeAccess}>
                    <input type="hidden" name="user_id" value={employee.user_id} />
                    <label><input type="checkbox" name="confirm_remove" value="yes" required /> Confirmo revocar el acceso a esta agencia</label>
                    <button className="button danger small" type="submit">Revocar acceso</button>
                  </form>
                </details>
              </>}
            </article>;
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Medidas de seguridad aplicadas</h2><p className="muted">Las restricciones también se verifican en la base de datos, no solo en el menú.</p></div></div>
        <ul className="team-security-list">
          <li>El titular es el único que puede agregar empleados y modificar sus permisos.</li>
          <li>Los nuevos empleados no pueden crear agentes, rendiciones ni cobros hasta ser autorizados.</li>
          <li>Los precios y el catálogo de juegos quedan reservados a titular/administrador.</li>
          <li>Las rendiciones con historial no se eliminan físicamente: se protegen para conservar la trazabilidad.</li>
        </ul>
      </section>
    </div>
  );
}
