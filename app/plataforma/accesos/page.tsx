import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  reviewPlatformAccessRequest,
  addPlatformAdmin,
  removePlatformAdmin,
  updatePlatformUserName,
  deletePlatformUser,
  updatePlatformAgencyName,
  deletePlatformAgency,
  transferPlatformAgencyOwner,
} from "./actions";

type AccessRequest = {
  user_id: string;
  email: string;
  full_name: string | null;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
};

type PlatformAccount = {
  organization_id: string | null;
  organization_name: string;
  organization_created_at: string | null;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  role: string | null;
  access_status: string;
  requested_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  is_platform_admin: boolean;
};

type AgencyGroup = {
  organization_id: string;
  organization_name: string;
  organization_created_at: string | null;
  members: PlatformAccount[];
};

type PlatformAdmin = {
  email: string;
  created_at: string;
  is_current_admin: boolean;
  has_account: boolean;
  email_confirmed: boolean;
};

type PlatformUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  is_platform_admin: boolean;
  membership_count: number;
  agency_names: string;
  owner_agency_count: number;
  created_agency_count: number;
};

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function statusLabel(status: string) {
  switch (status) {
    case "pending": return "Pendiente de aprobación";
    case "approved": return "Autorizado";
    case "active": return "Activo (cuenta existente)";
    case "suspended": return "Suspendido";
    case "revoked": return "Acceso revocado";
    case "rejected": return "Rechazado";
    default: return status;
  }
}

function roleLabel(role: string | null) {
  switch (role) {
    case "owner": return "Propietario";
    case "admin": return "Administrador";
    case "accountant": return "Contador";
    case "viewer": return "Consulta";
    default: return "Sin usuario vinculado";
  }
}

function AccountActions({ account }: { account: PlatformAccount }) {
  if (!account.user_id) return null;
  if (account.is_platform_admin) {
    return <p className="muted small-text">Administrador central · cuenta protegida</p>;
  }
  const currentlyBlocked = ["rejected", "suspended", "revoked"].includes(account.access_status);
  return (
    <form action={reviewPlatformAccessRequest} className="form-stack platform-access-actions">
      <input type="hidden" name="user_id" value={account.user_id} />
      <label>Nota de revisión (opcional)
        <input name="review_note" maxLength={500} defaultValue={account.review_note || ""} placeholder="Motivo o referencia interna" />
      </label>
      <div className="button-row">
        {currentlyBlocked ? (
          <button className="button primary" name="status" value="approved">Reactivar acceso</button>
        ) : (
          <>
            <button className="button secondary" name="status" value="suspended">Suspender</button>
            <button className="button secondary" name="status" value="revoked">Revocar acceso</button>
          </>
        )}
      </div>
    </form>
  );
}

export default async function PlatformAccessPage({ searchParams }: { searchParams: Promise<{ actualizado?: string; error?: string }> }) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");

  const { data: isAdmin, error: adminError } = await (supabase as any).rpc("is_platform_admin");
  if (adminError) throw new Error("No se pudo verificar el permiso de administrador central.");
  if (isAdmin !== true) redirect("/login?perfil=administrador");

  const { data: currentMember, error: currentMemberError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", String(authData.claims.sub))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (currentMemberError) throw new Error("No se pudo verificar el vínculo de la cuenta administradora.");

  const [
    { data: requestData, error: requestError },
    { data: accountData, error: accountError },
    { data: adminData, error: adminListError },
    { data: userData, error: userListError },
  ] = await Promise.all([
    (supabase as any).rpc("list_platform_access_requests"),
    (supabase as any).rpc("list_platform_agencies_and_users"),
    (supabase as any).rpc("list_platform_admins"),
    (supabase as any).rpc("list_platform_users"),
  ]);
  if (requestError) throw new Error("No se pudieron cargar las solicitudes de acceso.");
  if (accountError) throw new Error("No se pudo cargar el listado de agencias y cuentas existentes.");
  if (adminListError) throw new Error("No se pudo cargar el listado de administradores centrales.");
  if (userListError) throw new Error("No se pudo cargar el listado de cuentas de acceso.");

  const requests = (Array.isArray(requestData) ? requestData : []) as AccessRequest[];
  const accounts = (Array.isArray(accountData) ? accountData : []) as PlatformAccount[];
  const platformAdmins = (Array.isArray(adminData) ? adminData : []) as PlatformAdmin[];
  const users = (Array.isArray(userData) ? userData : []) as PlatformUser[];
  const currentUserId = String(authData.claims.sub);
  const params = await searchParams;

  const agencyMap = new Map<string, AgencyGroup>();
  for (const account of accounts) {
    if (!account.organization_id) continue;
    const existing = agencyMap.get(account.organization_id);
    if (existing) {
      existing.members.push(account);
    } else {
      agencyMap.set(account.organization_id, {
        organization_id: account.organization_id,
        organization_name: account.organization_name,
        organization_created_at: account.organization_created_at,
        members: [account],
      });
    }
  }
  const agencies = [...agencyMap.values()].sort((a, b) => a.organization_name.localeCompare(b.organization_name, "es"));
  const unlinkedAccounts = accounts.filter((account) => !account.organization_id && account.user_id);

  return (
    <main className="auth-page">
      <section className="auth-card wide platform-admin-page">
        <p className="eyebrow">ADMINISTRACIÓN CENTRAL</p>
        <h1>Control de acceso a agencias</h1>
        <p className="muted">Este es el panel central. Las solicitudes nuevas aparecen arriba; las agencias y cuentas que ya existían se administran en el listado de abajo. Suspender o revocar bloquea el acceso, pero no elimina rendiciones ni movimientos guardados.</p>

        <div className="button-row platform-access-summary">
          <span className="user-role-pill">Solicitudes pendientes: {requests.length}</span>
          <span className="user-role-pill">Agencias registradas: {agencies.length}</span>
          <span className="user-role-pill">Cuentas de acceso: {users.length}</span>
        </div>
        <div className="button-row">
          <Link className="button ghost" href="/">Volver a Administración Central</Link>
          {currentMember?.organization_id && <Link className="button primary" href="/pagos">Ingresar a mi agencia</Link>}
        </div>
        <p className="muted small-text">Estás viendo la base de datos aislada de Preview. Las agencias que solo existan en Producción no se muestran ni se modifican desde este panel.</p>
        {agencies.length === 1 && agencies[0]?.members.every((member) => member.is_platform_admin) && (
          <p className="message">La única cuenta listada es también la administradora central, por eso está protegida y no tiene botones de suspensión. Las acciones aparecerán para las demás cuentas y solicitudes cuando existan.</p>
        )}

        {params.actualizado && (
          <p className="message success-message">
            {params.actualizado === "admin_agregado" ? "Administrador central autorizado. Ya puede ingresar con su cuenta confirmada."
              : params.actualizado === "admin_retirado" ? "Se retiró el permiso de administrador central y se cerró esa sesión."
              : params.actualizado === "agencia_editada" ? "Se guardó el nombre de la agencia."
              : params.actualizado === "titularidad_transferida" ? "Se transfirió la titularidad de la agencia."
              : params.actualizado === "agencia_eliminada" ? "Se eliminó la agencia de Preview y sus datos asociados. Las cuentas de acceso no se borraron."
              : params.actualizado === "nombre_usuario" ? "Se actualizó el nombre de la cuenta."
              : params.actualizado === "usuario_eliminado" ? "Se eliminó la cuenta de acceso."
              : "Se actualizó el estado de acceso."}
          </p>
        )}
        {params.error && (
          <p className="message error-message">
            {params.error === "admin_correo" ? "No se pudo autorizar el correo. La persona debe registrarse primero y confirmar su dirección de email."
              : params.error === "admin_ultimo" ? "No se puede quitar el último administrador central. Primero autorizá y probá otra cuenta."
              : params.error === "admin_retirar" ? "No se pudo retirar el permiso. Verificá la confirmación y que el panel conserve otro administrador autorizado."
              : params.error === "agencia_nombre" ? "No se pudo guardar el nombre. Revisá que no esté vacío y que la agencia siga existiendo."
              : params.error === "agencia_transferir" ? "No se pudo transferir la agencia. La nueva cuenta debe existir, tener el correo confirmado y estar autorizada; volvé a verificar el nombre de la agencia."
              : params.error === "agencia_eliminar" ? "No se pudo eliminar. Debés escribir exactamente el nombre actual de la agencia y luego ELIMINAR."
              : params.error === "usuario_nombre" ? "No se pudo actualizar el nombre de la cuenta."
              : params.error === "usuario_eliminar_agencia" ? "No se puede eliminar esta cuenta mientras sea titular o haya creado una agencia existente. Transferí su titularidad o eliminá esa agencia primero."
              : params.error === "usuario_eliminar_admin" ? "Primero retirale el permiso de administrador central en la sección superior."
              : params.error === "usuario_eliminar_mismo" ? "No podés eliminar la cuenta con la que estás usando el panel. Entrá con otro administrador central."
              : params.error === "usuario_eliminar_confirmacion" ? "La confirmación no coincide. Escribí el correo exacto y la palabra ELIMINAR."
              : params.error === "usuario_eliminar" ? "No se pudo eliminar la cuenta. Revisá si tiene una agencia asociada o si ya fue eliminada."
              : "No se pudo aplicar el cambio. Revisá que tu usuario conserve el permiso de administrador central y verificá las confirmaciones."}
          </p>
        )}

        <section className="platform-access-section">
          <h2>1. Administradores centrales</h2>
          <p className="muted">El correo debe pertenecer a una cuenta existente y confirmada. Para cambiar el correo principal, autorizá primero la cuenta nueva, probá que pueda ingresar y después retirale el permiso a la anterior. No se puede retirar el último administrador.</p>
          <form action={addPlatformAdmin} className="platform-inline-form">
            <label>Correo de la cuenta que querés autorizar
              <input type="email" name="email" required maxLength={254} placeholder="nuevo-admin@correo.com" autoComplete="off" />
            </label>
            <button className="button primary">Autorizar administrador central</button>
          </form>
          <p className="muted small-text">¿Todavía no tiene cuenta? <Link href="/registro">Registrá la cuenta</Link> con ese correo y pedile que confirme el mensaje que reciba. Después volvé acá para autorizarla.</p>
          {platformAdmins.length === 0 ? (
            <p className="message error-message">No hay administradores centrales autorizados. No cierres esta sesión: revisá la configuración antes de continuar.</p>
          ) : (
            <div className="platform-admin-list">
              {platformAdmins.map((admin) => (
                <article key={admin.email} className="platform-management-card">
                  <div className="platform-management-identity">
                    <strong>{admin.email}</strong>
                    <p className="muted small-text">
                      {admin.is_current_admin ? "Sesión actual" : "Administrador central"}
                      {" · "}
                      {admin.has_account ? (admin.email_confirmed ? "Cuenta confirmada" : "Cuenta sin confirmar") : "No existe cuenta de acceso"}
                    </p>
                    {admin.is_current_admin && <p className="muted small-text">Al retirarte, esta sesión se cerrará. Hacelo solamente después de probar el acceso de otro administrador.</p>}
                  </div>
                  <form action={removePlatformAdmin} className="platform-danger-form">
                    <input type="hidden" name="email" value={admin.email} />
                    <label>Escribí QUITAR para confirmar
                      <input name="confirmation" required pattern="QUITAR" autoComplete="off" placeholder="QUITAR" />
                    </label>
                    <button className="button secondary">Retirar permiso central</button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="platform-access-section">
          <h2>2. Solicitudes de alta pendientes</h2>
          <p className="muted">Cuando una persona usa «Crear cuenta de propietario» en el registro, su solicitud aparece aquí. Aprobala para que pueda configurar su agencia; rechazala si no corresponde.</p>
          {requests.length === 0 ? (
            <p className="muted">No hay altas nuevas esperando aprobación en este momento.</p>
          ) : (
            <div className="form-stack">
              {requests.map((request) => (
                <article key={request.user_id} className="auth-card access-request-card">
                  <div>
                    <strong>{request.full_name || "Sin nombre informado"}</strong>
                    <p>{request.email}</p>
                    <p className="muted small-text">Solicitó acceso: {dateLabel(request.requested_at)}</p>
                  </div>
                  <form action={reviewPlatformAccessRequest} className="form-stack">
                    <input type="hidden" name="user_id" value={request.user_id} />
                    <label>Nota de revisión (opcional)
                      <input name="review_note" maxLength={500} defaultValue={request.review_note || ""} placeholder="Motivo o referencia interna" />
                    </label>
                    <div className="button-row">
                      <button className="button primary" name="status" value="approved">Aprobar alta</button>
                      <button className="button secondary" name="status" value="rejected">Rechazar</button>
                    </div>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="platform-access-section">
          <h2>4. Agencias y sus usuarios</h2>
          <p className="muted">Acá deben figurar las agencias existentes, sus usuarios y roles. Desde cada cuenta podés suspender el acceso temporalmente, revocarlo o reactivarlo. Los datos de la agencia quedan guardados.</p>
          {agencies.length === 0 ? (
            <p className="muted">No se encontraron agencias creadas en la base de datos de este Preview. Este listado es independiente de las solicitudes nuevas.</p>
          ) : (
            <div className="form-stack">
              {agencies.map((agency) => (
                <article key={agency.organization_id} className="auth-card platform-agency-card">
                  <div className="platform-agency-heading">
                    <div>
                      <h3>{agency.organization_name}</h3>
                      <p className="muted small-text">Alta: {dateLabel(agency.organization_created_at)} · {agency.members.filter((member) => member.user_id).length} cuenta(s) vinculada(s)</p>
                    </div>
                  </div>
                  <form action={updatePlatformAgencyName} className="platform-inline-form platform-edit-agency-form">
                    <input type="hidden" name="organization_id" value={agency.organization_id} />
                    <label>Nombre visible de la agencia
                      <input name="name" required maxLength={120} defaultValue={agency.organization_name} />
                    </label>
                    <button className="button secondary">Guardar nombre</button>
                  </form>
                  {agency.members.some((member) => member.user_id && member.role === "owner") && (
                    <details className="platform-details">
                      <summary>Transferir titularidad de esta agencia</summary>
                      <p className="muted small-text">La nueva persona debe tener una cuenta confirmada y autorizada. La cuenta anterior dejará de pertenecer a esta agencia, pero su permiso de Administrador Central, si tiene uno, se gestiona por separado.</p>
                      <form action={transferPlatformAgencyOwner} className="form-stack">
                        <input type="hidden" name="organization_id" value={agency.organization_id} />
                        <label>Titular actual que se va a reemplazar
                          <select name="previous_owner_user_id" required defaultValue="">
                            <option value="" disabled>Seleccioná el titular actual</option>
                            {agency.members.filter((member) => member.user_id && member.role === "owner").map((member) => (
                              <option key={member.user_id!} value={member.user_id!}>{member.email || member.full_name || member.user_id}</option>
                            ))}
                          </select>
                        </label>
                        <label>Correo de la nueva persona titular
                          <input type="email" name="new_owner_email" required maxLength={254} placeholder="titular@correo.com" autoComplete="off" />
                        </label>
                        <label>Repetí el nombre actual de la agencia: {agency.organization_name}
                          <input name="confirm_name" required autoComplete="off" placeholder="Nombre exacto de la agencia" />
                        </label>
                        <button className="button primary">Transferir titularidad</button>
                      </form>
                    </details>
                  )}
                  <details className="platform-details danger-details">
                    <summary>Eliminar esta agencia y sus datos</summary>
                    <p className="message error-message">Esta acción elimina la agencia de Preview y sus registros operativos asociados. No borra automáticamente los usuarios ni las autorizaciones centrales. Es irreversible.</p>
                    <form action={deletePlatformAgency} className="form-stack">
                      <input type="hidden" name="organization_id" value={agency.organization_id} />
                      <label>Escribí exactamente: {agency.organization_name}
                        <input name="confirm_name" required autoComplete="off" placeholder="Nombre exacto de la agencia" />
                      </label>
                      <label>Escribí ELIMINAR para confirmar
                        <input name="confirmation" required pattern="ELIMINAR" autoComplete="off" placeholder="ELIMINAR" />
                      </label>
                      <button className="button danger">Eliminar agencia y datos asociados</button>
                    </form>
                  </details>
                  <div className="form-stack">
                    {agency.members.map((member) => (
                      <div key={member.user_id || agency.organization_id} className="platform-account-row">
                        <div className="platform-account-identity">
                          <strong>{member.full_name || member.email || "Agencia sin usuario vinculado"}</strong>
                          {member.email && <p>{member.email}</p>}
                          <p className="muted small-text">{roleLabel(member.role)} · {statusLabel(member.access_status)}</p>
                          {member.reviewed_at && <p className="muted small-text">Última revisión: {dateLabel(member.reviewed_at)}{member.reviewed_by ? " · " + member.reviewed_by : ""}</p>}
                        </div>
                        <AccountActions account={member} />
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="platform-access-section">
          <h2>3. Todas las cuentas de acceso</h2>
          <p className="muted">Desde acá podés corregir el nombre de cada cuenta o eliminar su usuario de acceso. El correo de inicio de sesión no se modifica directamente desde esta pantalla: para el Administrador Central, agregá primero el correo confirmado nuevo y después retirale el permiso al anterior.</p>
          <div className="platform-user-list">
            {users.map((user) => (
              <article key={user.user_id} className="platform-management-card">
                <div className="platform-management-identity">
                  <strong>{user.email || "Cuenta sin correo"}</strong>
                  <p className="muted small-text">
                    {user.is_platform_admin ? "Administrador central" : "Usuario de agencia"}
                    {" · "}
                    {user.email_confirmed_at ? "Correo confirmado" : "Correo sin confirmar"}
                  </p>
                  <p className="muted small-text">Nombre: {user.full_name || "Sin nombre"} · Agencia(s): {user.agency_names}</p>
                  <p className="muted small-text">Titular de {user.owner_agency_count} agencia(s) · Creó {user.created_agency_count} agencia(s)</p>
                </div>
                <form action={updatePlatformUserName} className="platform-inline-form">
                  <input type="hidden" name="user_id" value={user.user_id} />
                  <label>Corregir nombre de la cuenta
                    <input name="full_name" required maxLength={120} defaultValue={user.full_name || ""} placeholder="Nombre completo" />
                  </label>
                  <button className="button secondary">Guardar nombre</button>
                </form>
                {user.is_platform_admin ? (
                  <p className="muted small-text">Para eliminar esta cuenta primero retirale su permiso central desde el listado de administradores. No se puede borrar el último administrador.</p>
                ) : user.user_id === currentUserId ? (
                  <p className="muted small-text">No podés eliminar desde acá la cuenta con la que estás usando este panel. Ingresá con otro administrador central.</p>
                ) : (user.owner_agency_count > 0 || user.created_agency_count > 0) ? (
                  <p className="muted small-text">Para eliminar este usuario primero transferí o eliminá la(s) agencia(s) donde figura como titular o creador. Sus datos operativos no se deben perder por borrar una cuenta.</p>
                ) : user.email ? (
                  <details className="platform-details danger-details">
                    <summary>Eliminar cuenta de usuario</summary>
                    <p className="message error-message">Esta operación elimina la cuenta de inicio de sesión y sus membresías de agencia. No elimina rendiciones ni movimientos de una agencia; confirmá que esa cuenta ya no debe tener acceso.</p>
                    <form action={deletePlatformUser} className="form-stack">
                      <input type="hidden" name="user_id" value={user.user_id} />
                      <label>Repetí el correo de la cuenta: {user.email}
                        <input type="email" name="confirm_email" required autoComplete="off" placeholder="Correo exacto de la cuenta" />
                      </label>
                      <label>Escribí ELIMINAR para confirmar
                        <input name="confirmation" required pattern="ELIMINAR" autoComplete="off" placeholder="ELIMINAR" />
                      </label>
                      <button className="button danger">Eliminar usuario definitivamente</button>
                    </form>
                  </details>
                ) : <p className="muted small-text">Esta cuenta no tiene un correo utilizable para confirmar la eliminación.</p>}
              </article>
            ))}
            {users.length === 0 && <p className="muted">No se encontraron cuentas de acceso.</p>}
          </div>
        </section>

        {unlinkedAccounts.length > 0 && (
          <section className="platform-access-section">
            <h2>5. Cuentas autorizadas sin agencia vinculada</h2>
            <p className="muted">Estas cuentas ya recibieron una decisión de acceso, pero todavía no figuran como miembros de una agencia.</p>
            <div className="form-stack">
              {unlinkedAccounts.map((account) => (
                <article key={account.user_id} className="auth-card access-request-card">
                  <div>
                    <strong>{account.full_name || account.email || "Cuenta sin nombre"}</strong>
                    <p>{account.email}</p>
                    <p className="muted small-text">{statusLabel(account.access_status)}</p>
                  </div>
                  <AccountActions account={account} />
                </article>
              ))}
            </div>
          </section>
        )}

        <div className="platform-access-help">
          <h2>Cómo se usa</h2>
          <p>1. El futuro titular se registra desde <Link href="/registro">Crear cuenta de propietario</Link>.</p>
          <p>2. Confirmada la cuenta, revisás su solicitud aquí y elegís Aprobar o Rechazar.</p>
          <p>3. Para cuentas existentes, buscá su agencia en el listado y usá Suspender, Revocar acceso o Reactivar acceso.</p>
          <p className="muted small-text">La cuenta administradora central está protegida para evitar que se bloquee a sí misma desde este panel.</p>
        </div>

        <Link href="/">Volver a Administración Central</Link>
      </section>
    </main>
  );
}
