import Link from "next/link";
import { ConfirmDeleteAccountButton } from "@/components/confirm-delete-account-button";
import { getCurrentContext } from "@/lib/accounting";
import { addEmployeeByEmail, removeEmployeeAccess, saveBackupEmail, retryRenditionBackup, saveAgencySchedules, saveEmployeePermissions, saveEmployeeRole, cleanupAgencyTestData, deleteUnlinkedAuthAccount } from "./actions";

const roleLabels: Record<string, string> = { owner: "Propietario", admin: "Administrador", accountant: "Contador", viewer: "Consulta" };

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
  const { supabase, organization, member, userId } = await getCurrentContext();
  if (!organization || !member) return null;

  if (member.role !== "owner") {
    return <div className="page">
      <div className="topbar"><div><p className="eyebrow">SEGURIDAD</p><h1>Personal y permisos</h1><p className="muted">La administración de usuarios y permisos es exclusiva del titular de la agencia.</p></div></div>
      <section className="panel"><h2>Acceso restringido</h2><p className="muted">Solicitá al titular que te asigne los permisos necesarios. No podés cambiar permisos, cuentas de acceso ni configuración de seguridad.</p><Link href="/dashboard" className="button ghost">Volver al inicio</Link></section>
    </div>;
  }

  const [{ data: employees, error: employeeError }, { data: backupSettings }, { data: backupRows, error: backupRowsError }, { data: cleanupPreview, error: cleanupPreviewError }, { data: operationalSettings }] = await Promise.all([
    supabase.rpc("list_organization_members_for_owner", { p_organization_id: organization.id }),
    supabase.from("organization_backup_settings").select("recipient_email,enabled,include_ticket_photo,updated_at").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("agency_rendition_backup_outbox").select("id,rendition_id,recipient_email,subject,text_body,status,attempt_count,last_attempt_at,sent_at,last_error,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("preview_agency_launch_cleanup", { p_organization_id: organization.id }),
    supabase.from("agency_operational_settings").select("rendition_cutoff_time,backup_send_time,updated_at").eq("organization_id", organization.id).maybeSingle(),
  ]);
  const cutoff = String(operationalSettings?.rendition_cutoff_time ?? "00:00").slice(0, 5);
  const backupSendTime = String(operationalSettings?.backup_send_time ?? "23:50").slice(0, 5);
  const cleanupLabels: Record<string, string> = {
    subagentes_ambulantes: "Subagentes y ambulantes",
    rendiciones: "Rendiciones",
    cobros_rendiciones: "Cobros de rendiciones",
    importes_por_juego: "Detalles por juego",
    tickets: "Tickets / cupones",
    respaldos: "Respaldos de rendiciones",
    movimientos_caja: "Movimientos de caja",
    cierres_diarios: "Cierres diarios",
    comisiones: "Configuración de comisiones",
    contactos: "Contactos antiguos",
    asientos_contables: "Asientos contables antiguos",
    lineas_contables: "Renglones contables antiguos",
    facturas_venta: "Facturas de venta antiguas",
    items_facturas_venta: "Ítems de venta antiguos",
    facturas_compra: "Facturas de compra antiguas",
    items_facturas_compra: "Ítems de compra antiguos",
    pagos_contables: "Pagos contables antiguos",
    empleados_vinculados: "Empleados vinculados a la agencia",
    permisos_empleados: "Permisos de empleados",
    registros_auditoria: "Registros de auditoría",
  };
  const ownerCount = (employees ?? []).filter((employee: { role: string }) => employee.role === "owner").length;
  const cleanupRows = cleanupPreview && typeof cleanupPreview === "object" && !Array.isArray(cleanupPreview)
    ? Object.entries(cleanupPreview).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    : [];
  const errorMessages: Record<string, string> = {
    "solo-titular": "Solo el titular de la agencia puede administrar empleados y permisos.",
    "datos-rol-invalidos": "Elegí un rol válido para la nueva cuenta.",
    "empleado-creado-rol-pendiente": "La cuenta se creó y quedó vinculada a esta agencia, pero no se pudo asignar el rol elegido. Buscala en la lista y guardá el rol desde su selector.",
    "ultimo-titular": "No se puede quitar ni bajar de rol al último Propietario. Primero asigná el rol Propietario a otra cuenta y guardá ese cambio.",
    "no-cambiar-rol-propio": "No podés cambiar tu propio rol desde tu sesión actual.",
    "rol-no-guardado": "No se pudo guardar el rol. No se modificaron los permisos.",
    "email-invalido": "Ingresá un correo válido.",
    "cuenta-no-registrada": "No se pudo encontrar la cuenta después del registro. No se creó la membresía; verificá el correo e intentá nuevamente.",
    "empleado-existente": "Ese correo ya está vinculado a esta agencia. Buscalo en la lista para modificar el rol, los permisos o quitarle el acceso.",
    "contrasena-corta": "La contraseña inicial debe tener al menos 8 caracteres.",
    "alta-empleado-fallida": "No se pudo agregar al empleado.",
    "usuario-invalido": "La operación solicitada no es válida.",
    "usuario-no-encontrado": "No encontramos al empleado dentro de esta agencia.",
    "no-se-puede-modificar-titular": "La cuenta del titular no se puede modificar ni revocar desde esta pantalla.",
    "permisos-no-guardados": "No se pudieron guardar los permisos. No se aplicaron cambios.",
    "acceso-no-revocado": "No se pudo revocar el acceso del empleado.",
    "contrasena-incorrecta": "La contraseña no coincide. No se quitó ningún acceso.",
    "verificacion-fallida": "No se pudo verificar la cuenta actual. No se quitaron accesos.",
    "funcion-remocion-pendiente": "Falta aplicar en Supabase la función segura de eliminación. No se cambió ningún acceso.",
    "sin-permiso-eliminar": "Solo el titular puede quitar ese usuario.",
    "email-backup-invalido": "Ingresá un correo válido para los backups.",
    "backup-email-no-guardado": "No se pudo guardar el correo para respaldos.",
    "horario-configuracion-invalida": "Elegí horarios válidos en formato HH:MM.",
    "horarios-no-guardados": "No se pudieron guardar los horarios. No se aplicaron cambios.",
    "backup-no-enviado": "El respaldo quedó en la cola, pero el correo no pudo enviarse. Revisá la configuración de envío y volvé a intentar.",
    "limpieza-no-confirmada": "No se hizo ninguna limpieza. Marcá la confirmación y escribí el texto exacto solicitado.",
    "limpieza-fallida": "No se pudieron limpiar los datos de prueba. No inicies la operación oficial hasta revisar el error.",
    "limpieza-fotos-fallida": "La base se limpió, pero algunas fotos privadas de prueba quedaron pendientes de borrar.",

    "confirmacion-cuenta-no-valida": "Marcá la confirmación y escribí exactamente ELIMINAR CUENTA: seguido del correo.",
    "cuenta-no-encontrada": "No encontramos una cuenta registrada con ese correo.",
    "cuenta-vinculada": "Esa cuenta todavía pertenece a una agencia. Quitá su acceso desde la tarjeta del empleado primero; por seguridad no se elimina una cuenta vinculada.",
    "cuenta-no-eliminada": "No se pudo eliminar la cuenta de acceso. No se modificaron las rendiciones ni los datos de la agencia.",
    "no-borrar-usuario-actual": "No podés eliminar la cuenta con la que estás trabajando.",

    "busqueda-cuenta-fallida": "No se pudo buscar esa cuenta en Supabase. Intentá otra vez; no se eliminó nada.",
    "limpieza-cuenta-fallida": "No se pudo comprobar o limpiar la cuenta. No se eliminó nada.",
    "funcion-eliminacion-no-disponible": "El servicio de eliminación no respondió correctamente. No se eliminó la cuenta; probá nuevamente más tarde.",
  };

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">SEGURIDAD DE LA AGENCIA</p><h1>Personal y permisos</h1><p className="muted">El titular decide a qué módulos puede entrar cada empleado y qué operaciones puede realizar.</p></div>
        <span className="badge success">Titular</span>
      </div>
      {params.resultado === "empleado-creado" && <p className="message success-message">Cuenta vinculada a esta agencia. Si el correo ya tenía cuenta, debe ingresar con su contraseña habitual; si era nuevo, usará la contraseña inicial y confirmará el correo si Supabase lo solicita.</p>}
      {params.resultado === "cuenta-eliminada" && <p className="message success-message">La cuenta global de inicio de sesión fue eliminada. No se borraron las rendiciones ni los datos de la agencia.</p>}
      {params.resultado === "permisos-guardados" && <p className="message success-message">Permisos guardados correctamente.</p>}
      {params.resultado === "rol-guardado" && <p className="message success-message">El rol se actualizó correctamente.</p>}
      {params.resultado === "acceso-revocado" && <p className="message success-message">Se revocó el acceso del empleado a esta agencia. Su cuenta general de autenticación no fue eliminada.</p>}
      {params.resultado === "horarios-guardados" && <p className="message success-message">Se guardaron los horarios del reinicio diario y del envío automático del backup.</p>}
      {params.resultado === "backup-email-guardado" && <p className="message success-message">Se guardó el correo de respaldo. Las nuevas rendiciones se encolarán para enviarse a esa dirección.</p>}
      {params.resultado === "backup-reintento" && <p className="message success-message">Se solicitó nuevamente el envío del respaldo.</p>}
      {params.resultado === "limpieza-completada" && <p className="message success-message">Limpieza finalizada. Se borraron los registros operativos listados y se vació el correo de backup guardado. Se conservaron la agencia, el acceso del titular, el catálogo de juegos y las cuentas de Caja.</p>}
      {params.resultado === "limpieza-completada-fotos-pendientes" && <p className="message error-message">La base quedó limpia, pero no se pudieron quitar todas las fotos privadas de prueba. Revisá el almacenamiento antes del uso oficial.</p>}
      {params.error && <p className="message error-message">{errorMessages[params.error] ?? "No se pudo completar la operación. Revisá los datos e intentá nuevamente."}</p>}

      <section className="panel operational-schedule-panel">
        <div className="panel-head">
          <div><h2>Reinicio de la rendición diaria</h2><p className="muted">Ajustá el comienzo de la jornada y la hora del backup automático desde el mismo bloque.</p></div>
          <span className="badge success">Solo titular</span>
        </div>
        <form action={saveAgencySchedules} className="operational-schedule-form">
          <div className="operational-schedule-grid">
            <label>Hora de reinicio diario
              <input type="time" name="rendition_cutoff_time" defaultValue={cutoff} required />
              <span className="muted small-text">Cambia el día operativo sin borrar el historial.</span>
            </label>
            <label>Hora de envío del backup
              <input type="time" name="backup_send_time" defaultValue={backupSendTime} required />
              <span className="muted small-text">Horario local de Argentina; envío automático todos los días.</span>
            </label>
          </div>
          <button className="button primary" type="submit">Guardar horarios</button>
        </form>
      </section>

      <section className="panel team-permissions-panel">
        <div className="panel-head"><div><h2>Personal de la agencia</h2><p className="muted">Creá cuentas, asigná roles y configurá qué puede hacer cada persona. Todo se administra desde este bloque.</p></div><span className="muted">{employees?.length ?? 0} {(employees?.length ?? 0) === 1 ? "cuenta" : "cuentas"}</span></div>
        <section className="team-add-member">
          <div className="panel-head"><div><h3>Agregar una cuenta</h3><p className="muted">Si el correo ya existe, se vincula sin crear otro usuario y no hace falta contraseña. Si es nuevo, ingresá una contraseña inicial de al menos 8 caracteres. Desde la tarjeta de cada empleado podrás modificar el rol, ajustar permisos y eliminar su acceso a esta agencia.</p></div></div>
          <form action={addEmployeeByEmail} className="inline-form team-add-form">
            <label>Correo de acceso<input type="email" name="email" placeholder="correo@empleado.com" required autoComplete="off" /></label>
            <label>Contraseña inicial (solo cuenta nueva)<input type="password" name="password" placeholder="Solo para correo nuevo · 8 caracteres" minLength={8} autoComplete="new-password" /></label>
            <label>Rol inicial
              <select name="role" defaultValue="accountant">
                <option value="owner">Propietario</option>
                <option value="admin">Administrador</option>
                <option value="accountant">Contador</option>
                <option value="viewer">Consulta</option>
              </select>
            </label>
            <button className="button primary" type="submit">Crear cuenta y asignar rol</button>
          </form>
        </section>
                {employeeError && <p className="message error-message">No se pudo consultar la lista de empleados.</p>}
        {!employeeError && (!employees || !employees.length) && <p className="muted">Todavía no hay personal vinculado. Usá el formulario “Agregar una cuenta” de este mismo bloque. Para crear el nuevo responsable, elegí “Propietario” en Rol inicial.</p>}
        <div className="team-member-list">
          {(employees ?? []).map((employee: any) => {
            const isCurrentUser = employee.user_id === userId;
            const isOwner = employee.role === "owner";
            const isAdmin = employee.role === "admin";
            const roleName = roleLabels[employee.role] ?? "Empleado";
            return <article className="team-member-card" key={employee.user_id}>
              <div className="team-member-header">
                <div><h3>{employee.full_name || employee.email}</h3><p className="muted">{employee.email}</p></div>
                <span className={"badge " + (isOwner ? "success" : "")}>{roleName}{isCurrentUser ? " · Tu sesión" : ""}</span>
              </div>
              {isCurrentUser ? (
                <p className="team-role-note">Este es tu usuario actual. Para evitar bloquearte, el rol de tu propia sesión no se cambia desde acá.</p>
              ) : (
                <form action={saveEmployeeRole} className="team-role-form">
                  <input type="hidden" name="user_id" value={employee.user_id} />
                  <label>Modificar rol de acceso
                    <select name="role" defaultValue={employee.role} aria-label={"Modificar rol de " + employee.email}>
                      <option value="owner">Propietario</option>
                      <option value="admin">Administrador</option>
                      <option value="accountant">Contador</option>
                      <option value="viewer">Consulta</option>
                    </select>
                  </label>
                  <button className="button primary small" type="submit">Guardar cambios de rol</button>
                </form>
              )}
              {isOwner && isCurrentUser && ownerCount <= 1 && (
                <p className="team-role-note">No se puede quitar este acceso porque es el único Propietario de la agencia. Primero agregá otra cuenta, elegí Propietario en su selector y guardá el cambio.</p>
              )}
              {isOwner && ownerCount > 1 && (
                <div className="team-remove-access-visible">
                  <strong>{isCurrentUser ? "Quitar mi acceso a esta agencia" : "Quitar acceso a esta agencia"}</strong>
                  <p>La cuenta conservará su usuario global, pero dejará de entrar a esta agencia. Se mantienen las rendiciones y el historial.</p>
                  <form action={removeEmployeeAccess}>
                    <input type="hidden" name="user_id" value={employee.user_id} />
                    <label>Contraseña actual del titular<input type="password" name="password" autoComplete="current-password" required aria-label={"Contraseña para quitar a " + employee.email} /></label>
                    <label><input type="checkbox" name="confirm_remove" value="yes" required /> Confirmo quitar este acceso</label>
                    <button className="button danger small" type="submit">{isCurrentUser ? "Quitar mi acceso" : "Eliminar acceso"}</button>
                  </form>
                </div>
              )}
              {!isOwner && (
                <>
                  {isAdmin && <p className="message">Administrador: tiene acceso amplio a la gestión de la agencia y al catálogo. Revisá este rol antes de guardarlo.</p>}
                  {!isAdmin && (
                    <form action={saveEmployeePermissions} className="team-permissions-form">
                      <input type="hidden" name="user_id" value={employee.user_id} />
                      <h4>Modificar permisos del empleado</h4>
                      <div className="team-permission-grid">
                        {permissionLabels.map(([name, label]) => <label key={name} className="team-permission-option"><input type="checkbox" name={name} defaultChecked={employee[name]} /><span>{label}</span></label>)}
                      </div>
                      <p className="team-security-note">El catálogo de juegos y sus valores no se incluyen en los permisos de empleados. Solo Propietario o Administrador puede cambiar el catálogo y los precios.</p>
                      <button className="button primary" type="submit">Guardar cambios de permisos</button>
                    </form>
                  )}
                  <div className="team-remove-access-visible">
                    <strong>Eliminar empleado de esta agencia</strong>
                    <p>Quita su acceso y permisos en esta agencia. No elimina su usuario general de inicio de sesión ni las rendiciones históricas.</p>
                    <form action={removeEmployeeAccess}>
                      <input type="hidden" name="user_id" value={employee.user_id} />
                      <label>Contraseña actual del titular<input type="password" name="password" autoComplete="current-password" required aria-label={"Contraseña para quitar a " + employee.email} /></label>
                      <label><input type="checkbox" name="confirm_remove" value="yes" required /> Confirmo quitar el acceso de {employee.email}</label>
                      <button className="button danger small" type="submit">Eliminar empleado de la agencia</button>
                    </form>
                  </div>
                </>
              )}
            </article>;
          })}
        </div>
      </section>


      <section className="panel team-auth-delete-panel">
        <div className="panel-head"><div><h2>Eliminar cuenta</h2><p className="muted">Ingresá el correo de la cuenta y tu contraseña de titular. Al pulsar el botón, te pediremos confirmar una sola vez.</p></div></div>
        <form action={deleteUnlinkedAuthAccount} className="team-auth-delete-form">
          <label>Correo de la cuenta a eliminar<input type="email" name="target_email" placeholder="correo@gmail.com" autoComplete="off" required /></label>
          <label>Tu contraseña<input type="password" name="owner_password" placeholder="Contraseña actual del titular" autoComplete="current-password" required /></label>
          <input type="hidden" name="delete_account_confirmed" value="" />
          <ConfirmDeleteAccountButton className="button danger">Eliminar cuenta</ConfirmDeleteAccountButton>
        </form>
      </section>

      <section className="panel team-backup-panel">
        <div className="panel-head"><div><h2>Backup automático de rendiciones</h2><p className="muted">Cada rendición registrada genera un respaldo legible en texto con agencia, subagente/ambulante, fecha, período, sorteo, desglose por juego, total, tickets y observaciones.</p></div><span className={backupSettings?.enabled && backupSettings.recipient_email ? "badge success" : "badge"}>{backupSettings?.enabled && backupSettings.recipient_email ? "Correo configurado" : "Usa correo del titular"}</span></div>
        <form action={saveBackupEmail} className="inline-form team-add-form">
          <input type="email" name="recipient_email" defaultValue={backupSettings?.recipient_email ?? ""} placeholder="Dejar vacío para usar el correo de acceso del titular" autoComplete="email" />
          <label className="backup-photo-option"><input type="checkbox" name="include_ticket_photo" defaultChecked={backupSettings?.include_ticket_photo ?? true} /> Adjuntar foto del ticket cuando esté disponible</label>
          <button className="button primary" type="submit">Guardar backup del titular</button>
        </form>
        <p className="team-security-note">Solo el titular recibe los backups. Cada rendición genera un respaldo de texto; la foto se adjunta si esta opción está marcada y se pudo guardar. El sistema informa “Enviado” únicamente si el proveedor de correo confirma el envío.</p>
        <div className="team-backup-log">
          <div className="panel-head"><div><h3>Últimos respaldos</h3><p className="muted">Historial de cola, intentos y estado de envío.</p></div><span className="muted">{backupRows?.length ?? 0}</span></div>
          {backupRowsError && <p className="message error-message">No se pudo leer el historial de respaldos.</p>}
          {!backupRowsError && (!backupRows || !backupRows.length) && <p className="muted">Todavía no se generaron respaldos para las rendiciones. Las que se registren después de configurar un correo se encolarán aquí.</p>}
          {(backupRows ?? []).map((backup) => <details className="team-backup-record" key={backup.id}>
            <summary><span>{backup.subject}</span><span className={backup.status === "sent" ? "badge success" : backup.status === "failed" ? "badge warning" : "badge"}>{backup.status === "sent" ? "Enviado" : backup.status === "failed" ? "Falló" : backup.status === "sending" ? "Enviando" : "Pendiente"}</span></summary>
            <div className="team-backup-record-body"><p><strong>Destino:</strong> {backup.recipient_email} · <strong>Creado:</strong> {backup.created_at}</p>
              {backup.sent_at && <p><strong>Enviado:</strong> {backup.sent_at}</p>}
              {backup.last_error && <p className="message error-message">{(String(backup.last_error).toLowerCase().includes("you can only send testing emails to your own email address") || String(backup.last_error).toLowerCase().includes("verify a domain at resend.com/domains")) ? <>Resend está en modo de prueba y bloquea envíos a otros destinatarios. Conservá esta copia y verificá un dominio propio en <a href="https://resend.com/domains" target="_blank" rel="noreferrer">Resend → Domains</a>. Después configurá <code>RESEND_FROM_EMAIL</code> con una dirección de ese dominio en los secretos de la función de Supabase y volvé a intentar.</> : backup.last_error}</p>}
              <pre>{backup.text_body}</pre>
              {backup.status !== "sent" && <form action={retryRenditionBackup}><input type="hidden" name="backup_id" value={backup.id} /><button className="button ghost small" type="submit">Enviar / reintentar</button></form>}
            </div>
          </details>)}
        </div>
      </section>

      <section className="panel team-cleanup-panel">
        <div className="panel-head">
          <div><h2>Preparar la puesta en marcha oficial</h2><p className="muted">La limpieza alcanza a todos los registros operativos actuales, sin distinguir entre datos de prueba y datos reales. Usala únicamente antes de comenzar la operación oficial.</p></div>
          <span className="badge warning">Acción irreversible</span>
        </div>
        <p className="team-security-note">Esta limpieza borra todos los agentes, rendiciones, cobros, movimientos de caja, tickets, respaldos, registros de auditoría y registros operativos de los antiguos módulos contables que pertenezcan a esta agencia. No distingue si son de prueba o reales. También desconecta a los empleados que no sean titulares y vacía el correo de backup configurado. Conserva la agencia, tu acceso de titular, los juegos configurados, las cuentas de Caja y los catálogos base.</p>
        {cleanupPreviewError && <p className="message error-message">No se pudo obtener el inventario de datos. No ejecutes la limpieza hasta que el inventario esté disponible.</p>}
        {!cleanupPreviewError && <>
          <h3>Inventario actual de registros que se limpiarían</h3>
          {cleanupRows.length > 0
            ? <div className="team-cleanup-counts">{cleanupRows.map(([key, count]) => <div className="team-cleanup-count" key={key}><span>{cleanupLabels[key] ?? key}</span><strong>{count}</strong></div>)}</div>
            : <p className="muted">No hay registros operativos de prueba para limpiar en este momento.</p>}
          <form action={cleanupAgencyTestData} className="team-cleanup-form">
            <label>Para habilitar la limpieza, escribí exactamente: <strong>LIMPIAR DATOS DE PRUEBA</strong>
              <input type="text" name="confirmation" placeholder="LIMPIAR DATOS DE PRUEBA" autoComplete="off" required />
            </label>
            <label className="team-cleanup-confirm"><input type="checkbox" name="confirm_cleanup" value="yes" required /> Confirmo que se eliminarán todos los registros operativos que muestra el inventario, no solo los de prueba, y que no se podrán recuperar desde la aplicación.</label>
            <button className="button danger" type="submit">Limpiar los datos de prueba</button>
          </form>
        </>}
        <p className="muted team-cleanup-footnote">La acción solo la puede ejecutar el titular y vuelve a comprobarlo en Supabase. Esta limpieza no elimina la cuenta de acceso del titular ni las cuentas de autenticación de empleados: a los empleados se les quita la membresía de esta agencia; si son cuentas ficticias, deben eliminarse después en Supabase → Authentication → Users.</p>
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
