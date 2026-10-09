import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";
import { addEmployeeByEmail, removeEmployeeAccess, saveBackupEmail, retryRenditionBackup, saveEmployeePermissions, cleanupAgencyTestData } from "./actions";

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

  const [{ data: employees, error: employeeError }, { data: backupSettings }, { data: backupRows, error: backupRowsError }, { data: cleanupPreview, error: cleanupPreviewError }] = await Promise.all([
    supabase.rpc("list_organization_members_for_owner", { p_organization_id: organization.id }),
    supabase.from("organization_backup_settings").select("recipient_email,enabled,include_ticket_photo,updated_at").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("agency_rendition_backup_outbox").select("id,rendition_id,recipient_email,subject,text_body,status,attempt_count,last_attempt_at,sent_at,last_error,created_at").eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("preview_agency_launch_cleanup", { p_organization_id: organization.id }),
  ]);
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
  const cleanupRows = cleanupPreview && typeof cleanupPreview === "object" && !Array.isArray(cleanupPreview)
    ? Object.entries(cleanupPreview).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    : [];
  const errorMessages: Record<string, string> = {
    "solo-titular": "Solo el titular de la agencia puede administrar empleados y permisos.",
    "email-invalido": "Ingresá un correo válido.",
    "cuenta-no-registrada": "El empleado primero debe crear su cuenta de acceso con ese correo y luego podrás vincularlo a la agencia.",
    "empleado-existente": "Ya existe una cuenta con ese correo. No se creó un usuario duplicado.",
    "contrasena-corta": "La contraseña inicial debe tener al menos 12 caracteres.",
    "alta-empleado-fallida": "No se pudo agregar al empleado.",
    "usuario-invalido": "La operación solicitada no es válida.",
    "usuario-no-encontrado": "No encontramos al empleado dentro de esta agencia.",
    "no-se-puede-modificar-titular": "La cuenta del titular no se puede modificar ni revocar desde esta pantalla.",
    "permisos-no-guardados": "No se pudieron guardar los permisos. No se aplicaron cambios.",
    "acceso-no-revocado": "No se pudo revocar el acceso del empleado.",
    "email-backup-invalido": "Ingresá un correo válido para los backups.",
    "backup-email-no-guardado": "No se pudo guardar el correo para respaldos.",
    "backup-no-enviado": "El respaldo quedó en la cola, pero el correo no pudo enviarse. Revisá la configuración de envío y volvé a intentar.",
    "limpieza-no-confirmada": "No se hizo ninguna limpieza. Marcá la confirmación y escribí el texto exacto solicitado.",
    "limpieza-fallida": "No se pudieron limpiar los datos de prueba. No inicies la operación oficial hasta revisar el error.",
    "limpieza-fotos-fallida": "La base se limpió, pero algunas fotos privadas de prueba quedaron pendientes de borrar.",
  };

  return (
    <div className="page">
      <div className="topbar">
        <div><p className="eyebrow">SEGURIDAD DE LA AGENCIA</p><h1>Personal y permisos</h1><p className="muted">El titular decide a qué módulos puede entrar cada empleado y qué operaciones puede realizar.</p></div>
        <span className="badge success">Titular</span>
      </div>
      {params.resultado === "empleado-creado" && <p className="message success-message">Acceso del empleado creado. Sus permisos operativos están desactivados hasta que los habilites. Si Supabase solicita confirmar el correo, deberá abrir ese mensaje antes del primer ingreso.</p>}
      {params.resultado === "permisos-guardados" && <p className="message success-message">Permisos guardados correctamente.</p>}
      {params.resultado === "acceso-revocado" && <p className="message success-message">Se revocó el acceso del empleado a esta agencia. Su cuenta general de autenticación no fue eliminada.</p>}
      {params.resultado === "backup-email-guardado" && <p className="message success-message">Se guardó el correo de respaldo. Las nuevas rendiciones se encolarán para enviarse a esa dirección.</p>}
      {params.resultado === "backup-reintento" && <p className="message success-message">Se solicitó nuevamente el envío del respaldo.</p>}
      {params.resultado === "limpieza-completada" && <p className="message success-message">Limpieza finalizada. Se borraron los registros operativos listados y se vació el correo de backup guardado. Se conservaron la agencia, tu acceso, el catálogo de juegos y las cuentas de Caja.</p>}
      {params.resultado === "limpieza-completada-fotos-pendientes" && <p className="message error-message">La base quedó limpia, pero no se pudieron quitar todas las fotos privadas de prueba. Revisá el almacenamiento antes del uso oficial.</p>}
      {params.error && <p className="message error-message">{errorMessages[params.error] ?? "No se pudo completar la operación. Revisá los datos e intentá nuevamente."}</p>}

      <section className="panel">
        <div className="panel-head"><div><h2>Agregar empleado</h2><p className="muted">El titular crea el acceso con correo y contraseña inicial. Entregale las credenciales por un canal privado y pedile cambiar la contraseña luego.</p></div></div>
        <form action={addEmployeeByEmail} className="inline-form team-add-form">
          <input type="email" name="email" placeholder="correo@empleado.com" required autoComplete="off" />
          <input type="password" name="password" placeholder="Contraseña inicial (mín. 12 caracteres)" minLength={12} required autoComplete="new-password" />
          <button className="button primary" type="submit">Crear acceso al empleado</button>
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
              {backup.last_error && <p className="message error-message">{backup.last_error}</p>}
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
        <p className="muted team-cleanup-footnote">La acción solo la puede ejecutar el titular y vuelve a comprobarlo en Supabase. Conserva tu usuario principal. Las cuentas de autenticación de empleados que se hayan creado no se borran de Auth: se les quita el acceso a esta agencia y, si son cuentas ficticias, después deben eliminarse individualmente en Supabase → Authentication → Users.</p>
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
              {isOwner ? (
                <p className="muted">Cuenta principal de la agencia. Para quitar al titular actual, primero transferí el rol de Propietario en Usuarios y roles.</p>
              ) : (
                <>
                  {isAdmin && <p className="message">Esta cuenta tiene rol Administrador y privilegios amplios. Podés quitarle el acceso desde esta misma tarjeta.</p>}
                  {!isAdmin && (
                    <form action={saveEmployeePermissions} className="team-permissions-form">
                      <input type="hidden" name="user_id" value={employee.user_id} />
                      <h4>Permisos habilitados</h4>
                      <div className="team-permission-grid">
                        {permissionLabels.map(([name, label]) => <label key={name} className="team-permission-option"><input type="checkbox" name={name} defaultChecked={employee[name]} /><span>{label}</span></label>)}
                      </div>
                      <p className="team-security-note">El catálogo de juegos y sus valores no se incluyen en los permisos de empleados. Solo el titular o un administrador puede cambiar el catálogo/precios.</p>
                      <button className="button primary" type="submit">Guardar permisos</button>
                    </form>
                  )}
                  <div className="team-remove-access-visible">
                    <strong>Eliminar empleado de esta agencia</strong>
                    <p>Quita su membresía y los permisos en esta agencia; conserva su cuenta de acceso general y no borra las rendiciones históricas.</p>
                    <form action={removeEmployeeAccess}>
                      <input type="hidden" name="user_id" value={employee.user_id} />
                      <label><input type="checkbox" name="confirm_remove" value="yes" required /> Confirmo quitar el acceso de {employee.email}</label>
                      <button className="button danger small" type="submit">Eliminar acceso del empleado</button>
                    </form>
                  </div>
                </>
              )}
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
