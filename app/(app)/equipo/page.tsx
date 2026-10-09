import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";
import { addEmployeeByEmail, removeEmployeeAccess, saveBackupEmail, retryRenditionBackup, saveEmployeePermissions } from "./actions";

const permissionLabels = [
  ["can_create_agents", "Dar de alta subagentes o ambulantes"],
  ["can_delete_agents", "Eliminar agentes sin rendiciones históricas"],
  ["can_create_renditions", "Registrar rendiciones diarias"],
  ["can_edit_renditions", "Corregir rendiciones"],
  ["can_delete_renditions", "Anular rendiciones sin cobros"],
  ["can_register_payments", "Registrar cobros en Caja"],
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

  const [{ data: employees, error: employeeError }, { data: backupSettings }, { data: backupRows, error: backupRowsError }] = await Promise.all([
    supabase.rpc("list_organization_members_for_owner", { p_organization_id: organization.id }),
    supabase.from("organization_backup_settings").select("recipient_email,enabled,updated_at").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("agency_rendition_backup_outbox").select("id,rendition_id,recipient_email,subject,text_body,status,attempt_count,last_attempt_at,sent_at,last_error,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
  ]);
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
    "email-backup-invalido": "Ingresá un correo válido para los backups.",
    "backup-email-no-guardado": "No se pudo guardar el correo para respaldos.",
    "backup-no-enviado": "El respaldo quedó en la cola, pero el correo no pudo enviarse. Revisá la configuración de envío y volvé a intentar.",
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
      {params.resultado === "backup-email-guardado" && <p className="message success-message">Se guardó el correo de respaldo. Las nuevas rendiciones se encolarán para enviarse a esa dirección.</p>}
      {params.resultado === "backup-reintento" && <p className="message success-message">Se solicitó nuevamente el envío del respaldo.</p>}
      {params.error && <p className="message error-message">{errorMessages[params.error] ?? "No se pudo completar la operación. Revisá los datos e intentá nuevamente."}</p>}

      <section className="panel">
        <div className="panel-head"><div><h2>Agregar empleado</h2><p className="muted">El empleado debe registrarse primero con su propio correo; luego vinculás esa cuenta a esta agencia.</p></div></div>
        <form action={addEmployeeByEmail} className="inline-form team-add-form">
          <input type="email" name="email" placeholder="correo@empleado.com" required autoComplete="email" />
          <button className="button primary" type="submit">Vincular empleado</button>
        </form>
      </section>

      <section className="panel team-backup-panel">
        <div className="panel-head"><div><h2>Backup automático de rendiciones</h2><p className="muted">Cada rendición registrada genera un respaldo legible en texto con agencia, subagente/ambulante, fecha, período, sorteo, desglose por juego, total, tickets y observaciones.</p></div><span className={backupSettings?.enabled && backupSettings.recipient_email ? "badge success" : "badge"}>{backupSettings?.enabled && backupSettings.recipient_email ? "Correo guardado" : "Falta configurar correo"}</span></div>
        <form action={saveBackupEmail} className="inline-form team-add-form">
          <input type="email" name="recipient_email" defaultValue={backupSettings?.recipient_email ?? ""} placeholder="correo-para-backup@ejemplo.com" autoComplete="email" />
          <button className="button primary" type="submit">Guardar correo de backup</button>
        </form>
        <p className="team-security-note">El respaldo de texto queda guardado en la base de datos y se prepara automáticamente al registrar una rendición. El envío por correo requiere configurar en Supabase los secretos del proveedor de correo; hasta entonces los respaldos aparecen como pendientes y no se declaran enviados.</p>
        <div className="team-backup-log">
          <div className="panel-head"><div><h3>Últimos respaldos</h3><p className="muted">Historial de cola, intentos y estado de envío.</p></div><span className="muted">{backupRows?.length ?? 0}</span></div>
          {backupRowsError && <p className="message error-message">No se pudo leer el historial de respaldos.</p>}
          {!backupRowsError && (!backupRows || !backupRows.length) && <p className="muted">Todavía no se generaron respaldos para las rendiciones. Las que se registren después de configurar un correo se encolarán aquí.</p>}
          {(backupRows ?? []).map((backup) => <details className="team-backup-record" key={backup.id}>
            <summary><span>{backup.subject}</span><span className={backup.status === "sent" ? "badge success" : backup.status === "failed" ? "badge warning" : "badge"}>{backup.status === "sent" ? "Enviado" : backup.status === "failed" ? "Falló" : backup.status === "sending" ? "Enviando" : "Pendiente"}</span></summary>
            <div className="team-backup-record-body"><p><strong>Destino:</strong> {backup.recipient_email} · <strong>Creado:</strong> {backup.created_at}</p>
              {backup.sent_at && <p><strong>Enviado:</strong> {backup.sent_at}</p>}
              {backup.last_error && <p className="message error-message">{backup.last_error}</p>}
              <pre>{backup.text_body}</pre>
              {backup.status !== "sent" && <form action={retryRenditionBackup}><input type="hidden" name="backup_id" value={backup.id} /><button className="button ghost small" type="submit">Enviar / reintentar</button></form>}
            </div>
          </details>)}
        </div>
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
