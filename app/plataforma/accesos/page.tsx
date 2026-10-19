import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { ConfirmPlatformDeleteButton } from "@/components/confirm-platform-delete-button";
import {
  reviewPlatformAccessRequest,
  addPlatformAdmin,
  removePlatformAdmin,
  updatePlatformUserName,
  deletePlatformUser,
  updatePlatformAgencyName,
  updatePlatformAgencyCity,
  updatePlatformAgencyCode,
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
  needs_recovery?: boolean;
};

type PlatformAccount = {
  organization_id: string | null;
  organization_name: string;
  organization_agency_code: string | null;
  organization_city: string | null;
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
  organization_agency_code: string | null;
  organization_city: string | null;
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
    case "accountant": return "Empleado";
    case "viewer": return "Empleado";
    default: return "Sin usuario vinculado";
  }
}

function AccountActions({ account }: { account: PlatformAccount }) {
  if (!account.user_id) return null;
  if (account.is_platform_admin) {
    return <p className="muted small-text">Administrador central · cuenta protegida</p>;
  }
  const currentlyBlocked = ["rejected", "suspended", "revoked"].includes(account.access_status);
  const isEmployee = account.role === "accountant" || account.role === "viewer";
  if (isEmployee) {
    return (
      <form action={reviewPlatformAccessRequest} className="form-stack platform-access-actions platform-employee-access-actions">
        <input type="hidden" name="user_id" value={account.user_id} />
        <p className="muted small-text">El titular administra los permisos diarios del empleado. Acá solo se permite una suspensión general excepcional o reactivar la cuenta.</p>
        {currentlyBlocked
          ? <button className="button primary" name="status" value="approved">Reactivar acceso</button>
          : <button className="button secondary" name="status" value="suspended">Suspender acceso</button>}
      </form>
    );
  }
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


function AgencyManagementAccordion({ agency, isOwnAgency = false }: { agency: AgencyGroup; isOwnAgency?: boolean }) {
  const owners = agency.members.filter((member) => member.user_id && member.role === "owner");
  const linkedMembers = agency.members.filter((member) => member.user_id);
  return (
    <details className={"platform-agency-accordion" + (isOwnAgency ? " is-own-agency" : "")}>
      <summary className="platform-entity-summary platform-agency-summary">
        <span className="platform-entity-kind">{isOwnAgency ? "MI AGENCIA" : "AGENCIA"}</span>
        <span className="platform-entity-copy">
          <strong>{agency.organization_name}</strong>
          <small>N.º oficial: {agency.organization_agency_code || "sin configurar"} · {agency.organization_city || "ciudad sin registrar"} · {linkedMembers.length} cuenta(s)</small>
        </span>
        <span className="platform-entity-open">Abrir opciones ▾</span>
      </summary>
      <div className="platform-agency-content">
        <div className="platform-agency-facts">
          <div><span>Número oficial</span><strong>{agency.organization_agency_code || "No configurado"}</strong></div>
          <div><span>Nombre visible</span><strong>{agency.organization_name}</strong></div>
          <div><span>Ciudad / localidad</span><strong>{agency.organization_city || "No informada"}</strong></div>
          <div><span>Correo del titular</span><strong>{owners.map((owner) => owner.email || owner.full_name || "Sin correo").join(", ") || "Sin titular vinculado"}</strong></div>
        </div>

        <div className="platform-agency-manage-grid">
          <div className="platform-agency-manage-card">
            <h4>Nombre visible de la agencia</h4>
            <form action={updatePlatformAgencyName} className="platform-inline-form">
              <input type="hidden" name="organization_id" value={agency.organization_id} />
              <label>Nombre visible
                <input name="name" required maxLength={120} defaultValue={agency.organization_name} />
              </label>
              <button className="button secondary">Guardar nombre</button>
            </form>
          </div>

          <div className="platform-agency-manage-card">
            <h4>Ciudad / localidad</h4>
            <form action={updatePlatformAgencyCity} className="platform-inline-form">
              <input type="hidden" name="organization_id" value={agency.organization_id} />
              <label>Ciudad
                <input name="city" maxLength={120} defaultValue={agency.organization_city || ""} placeholder="Ciudad o localidad" />
              </label>
              <button className="button secondary">Guardar ciudad</button>
            </form>
          </div>

          <div className="platform-agency-manage-card">
            <h4>Número oficial de agencia</h4>
            <form action={updatePlatformAgencyCode} className="platform-inline-form">
              <input type="hidden" name="organization_id" value={agency.organization_id} />
              <label>Número oficial (3 dígitos)
                <input name="agency_code" required inputMode="numeric" pattern="[0-9]{3}" minLength={3} maxLength={3} defaultValue={agency.organization_agency_code || ""} placeholder="000" />
              </label>
              <button className="button secondary">Guardar número oficial</button>
            </form>
            <p className="muted small-text">El número debe tener tres dígitos y no puede estar asignado a otra agencia.</p>
          </div>

          {owners.length > 0 && (
            <details className="platform-details">
              <summary>Transferir titularidad de esta agencia</summary>
              <p className="muted small-text">La nueva persona debe tener una cuenta confirmada y autorizada. La cuenta anterior dejará de pertenecer a esta agencia, pero su permiso de Administrador Central se gestiona por separado.</p>
              <form action={transferPlatformAgencyOwner} className="form-stack">
                <input type="hidden" name="organization_id" value={agency.organization_id} />
                <label>Titular actual que se va a reemplazar
                  <select name="previous_owner_user_id" required defaultValue="">
                    <option value="" disabled>Seleccioná el titular actual</option>
                    {owners.map((owner) => (
                      <option key={owner.user_id!} value={owner.user_id!}>{owner.email || owner.full_name || owner.user_id}</option>
                    ))}
                  </select>
                </label>
                <label>Correo de la nueva persona titular
                  <input type="email" name="new_owner_email" required maxLength={254} placeholder="titular@correo.com" autoComplete="off" />
                </label>                <label>Repetí el nombre actual de la agencia: {agency.organization_name}
                  <input name="confirm_name" required autoComplete="off" placeholder="Nombre exacto de la agencia" />
                </label>
                <button className="button primary">Transferir titularidad</button>
              </form>
            </details>
          )}

          <details className="platform-details danger-details">
            <summary>Eliminar esta agencia y sus datos</summary>
            <p className="message error-message">Se eliminarán esta agencia, sus rendiciones, pagos, movimientos, comprobantes y demás datos asociados. Si el titular no tiene otra agencia ni otro acceso, también se eliminará su cuenta. Esta acción es irreversible.</p>
            <form action={deletePlatformAgency} className="form-stack">
              <input type="hidden" name="organization_id" value={agency.organization_id} />
              <input type="hidden" name="confirm_name" value={agency.organization_name} />
              <input type="hidden" name="confirmation" value="ELIMINAR" />
              <ConfirmPlatformDeleteButton className="button danger" message={`¿Eliminar definitivamente la agencia "${agency.organization_name}" y todos sus datos asociados? Si su titular no tiene otros accesos, también se eliminará su cuenta.`}>Eliminar agencia y datos asociados</ConfirmPlatformDeleteButton>
            </form>
          </details>
        </div>

        <section className="platform-agency-linked-accounts">
          <h4>Cuentas vinculadas a esta agencia</h4>
          <div className="platform-agency-member-grid">
            {agency.members.map((member, index) => (
              <div className="platform-agency-member" key={member.user_id || agency.organization_id + "-" + index}>
                <strong>{member.full_name || member.email || "Agencia sin usuario vinculado"}</strong>
                {member.email && <span>{member.email}</span>}
                <small>{roleLabel(member.role)} · {statusLabel(member.access_status)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </details>
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
    (supabase as any).rpc("list_platform_agencies_and_users_v2"),
    (supabase as any).rpc("list_platform_admins"),
    (supabase as any).rpc("list_platform_users"),
  ]);
  if (requestError) throw new Error("No se pudieron cargar las solicitudes de acceso.");
  if (accountError) throw new Error("No se pudo cargar el listado de agencias y cuentas existentes.");
  if (adminListError) throw new Error("No se pudo cargar el listado de administradores centrales.");
  if (userListError) throw new Error("No se pudo cargar el listado de cuentas de acceso.");

  const listedRequests = (Array.isArray(requestData) ? requestData : []) as AccessRequest[];
  const accounts = (Array.isArray(accountData) ? accountData : []) as PlatformAccount[];
  const platformAdmins = (Array.isArray(adminData) ? adminData : []) as PlatformAdmin[];
  const users = (Array.isArray(userData) ? userData : []) as PlatformUser[];
  // Recupera cuentas confirmadas sin membresía cuyo registro no generó una solicitud pendiente.
  // La acción de revisión crea/actualiza la solicitud de forma segura en el servidor.
  const listedRequestIds = new Set(listedRequests.map((request) => request.user_id));
  // The agencies/accounts RPC includes non-pending requests without an agency. A reviewed
  // account must never be reconstructed as a pending request just because it has no membership.
  const reviewedUserIds = new Set(
    accounts
      .filter((account) => account.user_id && ["approved", "rejected", "suspended", "revoked"].includes(account.access_status))
      .map((account) => String(account.user_id)),
  );
  const recoverableRequests: AccessRequest[] = users
    .filter((user) => user.email_confirmed_at && !user.is_platform_admin && user.membership_count === 0 && !listedRequestIds.has(user.user_id) && !reviewedUserIds.has(user.user_id))
    .map((user) => ({
      user_id: user.user_id,
      email: user.email || "",
      full_name: user.full_name,
      status: "pending",
      requested_at: user.created_at,
      reviewed_at: null,
      reviewed_by: null,
      review_note: null,
      needs_recovery: true,
    }));
  const requests = [...listedRequests, ...recoverableRequests].sort((a, b) => a.requested_at.localeCompare(b.requested_at));
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
        organization_agency_code: account.organization_agency_code ?? null,
        organization_city: account.organization_city ?? null,
        organization_created_at: account.organization_created_at,
        members: [account],
      });
    }
  }
  const agencies = [...agencyMap.values()].sort((a, b) => a.organization_name.localeCompare(b.organization_name, "es"));
  const myAgency = currentMember?.organization_id
    ? agencies.find((agency) => agency.organization_id === String(currentMember.organization_id)) ?? null
    : null;
  const otherAgencies = agencies.filter((agency) => agency.organization_id !== myAgency?.organization_id);

  return (
    <main className="auth-page">
      <section className="auth-card wide platform-admin-page">
        <p className="eyebrow">ADMINISTRACIÓN CENTRAL</p>
        <h1>Control de acceso a agencias</h1>
        <p className="muted">Este es el panel central. Las solicitudes nuevas aparecen arriba; las agencias y cuentas existentes se consultan abajo. El titular administra el alta, la baja y los permisos de sus empleados; desde acá solo podés suspender o reactivar globalmente una cuenta, sin borrar rendiciones ni movimientos.</p>

        <nav className="platform-access-summary platform-access-summary-grid" aria-label="Accesos rápidos del control central">
          <Link className="button ghost platform-summary-button" href="#solicitudes-alta" aria-label={`Ir a solicitudes pendientes: ${requests.length}`}>
            <span>Solicitudes pendientes</span><strong>{requests.length}</strong>
          </Link>
          <Link className="button ghost platform-summary-button" href="#agencias-registradas" aria-label={`Ir a agencias registradas: ${agencies.length}`}>
            <span>Agencias registradas</span><strong>{agencies.length}</strong>
          </Link>
          <Link className="button ghost platform-summary-button" href="#cuentas-acceso" aria-label={`Ir a cuentas de acceso: ${users.length}`}>
            <span>Cuentas de acceso</span><strong>{users.length}</strong>
          </Link>
        </nav>
        <div className="platform-access-navigation">
          <Link className="button primary platform-summary-button" href="#solicitudes-alta">Revisar altas y aprobar/rechazar</Link>
          <Link className="button ghost platform-summary-button" href="/">Volver a Control de Agencias</Link>
          {currentMember?.organization_id && <Link className="button ghost platform-summary-button" href="/pagos">Ingresar a mi agencia</Link>}
          <SignOutButton className="button ghost platform-summary-button platform-logout-button" />
        </div>
        <p className="muted small-text">Tu agencia aparece separada de las demás. Cada ficha se abre al presionarla; la información y las acciones se muestran dentro de esa ficha para evitar mezclar agencias.</p>
        {agencies.length === 1 && agencies[0]?.members.every((member) => member.is_platform_admin) && (
          <p className="message">La única cuenta listada es también la administradora central, por eso está protegida y no tiene botones de suspensión. Las acciones aparecerán para las demás cuentas y solicitudes cuando existan.</p>
        )}

        {params.actualizado && (
          <p className="message success-message">
            {params.actualizado === "admin_agregado" ? "Administrador central autorizado. Ya puede ingresar con su cuenta confirmada."
              : params.actualizado === "admin_retirado" ? "Se retiró el permiso de administrador central y se cerró esa sesión."
              : params.actualizado === "agencia_editada" ? "Se guardó el nombre de la agencia."
              : params.actualizado === "ciudad_guardada" ? "Se guardó la ciudad de la agencia."
              : params.actualizado === "agencia_codigo" ? "Se guardó el número oficial de la agencia."
              : params.actualizado === "titularidad_transferida" ? "Se transfirió la titularidad de la agencia."
              : params.actualizado === "agencia_eliminada" ? "Se eliminó la agencia y sus datos asociados. La cuenta titular también se eliminó si no tenía otros accesos."
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
              : params.error === "agencia_ciudad" ? "No se pudo guardar la ciudad. Revisá que tenga como máximo 120 caracteres."
              : params.error === "agencia_codigo" ? "No se pudo guardar el número. Debe tener tres dígitos y no estar asignado a otra agencia."
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

        <section className="platform-access-section" id="solicitudes-alta">
          <h2>2. Solicitudes de alta pendientes</h2>
          <p className="muted">Cuando el titular completa el registro y confirma el correo, la solicitud aparece aquí. Si una cuenta confirmada quedó sin solicitud registrada, también se muestra para que puedas aprobarla o rechazarla desde este mismo lugar.</p>
          {requests.length === 0 ? (
            <p className="muted">No hay altas nuevas esperando aprobación en este momento.</p>
          ) : (
            <div className="form-stack">              {requests.map((request) => (
                <article key={request.user_id} className="auth-card access-request-card">
                  <div>
                    <strong>{request.full_name || "Sin nombre informado"}</strong>
                    <p>{request.email}</p>
                    <p className="muted small-text">{request.needs_recovery ? "Cuenta confirmada sin solicitud pendiente registrada · revisar alta" : "Solicitó acceso"}: {dateLabel(request.requested_at)}</p>
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
          <h2>3. Mi agencia</h2>
          <p className="muted">Tu propia agencia está aislada de las demás. Presioná el botón para ver su número oficial, nombre visible, ciudad, correo del titular y las acciones de administración.</p>
          {myAgency ? (
            <div className="platform-agency-grid">
              <AgencyManagementAccordion agency={myAgency} isOwnAgency />
            </div>
          ) : (
            <p className="message">Esta cuenta central no tiene una agencia vinculada como propia. Las demás agencias siguen apareciendo por separado en el listado siguiente.</p>
          )}
        </section>

        <section className="platform-access-section" id="agencias-registradas">
          <h2>4. Otras agencias</h2>
          <p className="muted">Cada agencia es un botón independiente. Al abrirlo, sus datos y sus cuentas quedan dentro de la misma ficha, sin mezclarse con tu agencia.</p>
          {otherAgencies.length === 0 ? (
            <p className="muted">No hay otras agencias registradas en este entorno.</p>
          ) : (
            <div className="platform-agency-grid">
              {otherAgencies.map((agency) => (
                <AgencyManagementAccordion key={agency.organization_id} agency={agency} />
              ))}
            </div>
          )}
        </section>

        <section className="platform-access-section" id="cuentas-acceso">
          <h2>5. Cuentas de acceso</h2>
          <p className="muted">Las cuentas se muestran en una lista de botones en columnas. Abrí una cuenta para suspender o reactivar el acceso, corregir el nombre o eliminar directamente un titular junto con sus agencias y datos asociados.</p>
          <div className="platform-user-list">
            {users.map((user) => {
              const userAccessRows = accounts.filter((account) => account.user_id === user.user_id);
              return (
                <details key={user.user_id} className="platform-management-card platform-user-accordion">
                  <summary className="platform-entity-summary platform-user-summary">
                    <span className="platform-entity-copy">
                      <strong>{user.email || "Cuenta sin correo"}</strong>
                      <small>{user.full_name || "Sin nombre"} · {user.agency_names || "Sin agencia vinculada"}</small>
                    </span>
                    <span className="platform-user-status">{user.is_platform_admin ? "Administrador central" : "Cuenta de agencia"}</span>
                    <span className="platform-entity-open">Administrar ▾</span>
                  </summary>
                  <div className="platform-user-content">
                    <div className="platform-management-identity">
                      <p className="muted small-text">
                        {user.is_platform_admin ? "Administrador central" : "Usuario de agencia"}
                        {" · "}
                        {user.email_confirmed_at ? "Correo confirmado" : "Correo sin confirmar"}
                      </p>
                      <p className="muted small-text">Titular de {user.owner_agency_count} agencia(s) · Creó {user.created_agency_count} agencia(s)</p>
                    </div>

                    <section className="platform-user-access-list">
                      <h4>Accesos por agencia</h4>
                      {userAccessRows.length ? userAccessRows.map((account, index) => (
                        <div className="platform-user-access-row" key={(account.organization_id || "sin-agencia") + "-" + user.user_id + "-" + index}>
                          <div>
                            <strong>{account.organization_name}</strong>
                            <p className="muted small-text">{roleLabel(account.role)} · {statusLabel(account.access_status)}</p>
                          </div>
                          <AccountActions account={account} />
                        </div>
                      )) : <p className="muted small-text">Esta cuenta todavía no tiene una solicitud autorizada ni una membresía de agencia para administrar.</p>}
                    </section>

                    <form action={updatePlatformUserName} className="platform-inline-form">
                      <input type="hidden" name="user_id" value={user.user_id} />
                      <label>Corregir nombre de la cuenta
                        <input name="full_name" required maxLength={120} defaultValue={user.full_name || ""} placeholder="Nombre completo" />
                      </label>
                      <button className="button secondary">Guardar nombre</button>
                    </form>
                    {user.is_platform_admin ? (
                      <p className="muted small-text">La cuenta administradora central está protegida y no se puede eliminar desde esta lista.</p>
                    ) : user.user_id === currentUserId ? (
                      <p className="muted small-text">No podés eliminar la cuenta con la que estás usando Administración Central.</p>
                    ) : user.email ? (
                      <details className="platform-details danger-details">
                        <summary>Eliminar titular y todo lo asociado</summary>
                        <p className="message error-message">Se eliminarán la cuenta de acceso, sus agencias propias y todos los datos operativos vinculados a esas agencias, incluidos rendiciones, pagos, movimientos y comprobantes. Los datos de otras agencias donde solo sea empleado no se borrarán; se quitará su acceso. Esta acción es irreversible.</p>
                        <form action={deletePlatformUser} className="form-stack">
                          <input type="hidden" name="user_id" value={user.user_id} />
                          <input type="hidden" name="confirm_email" value={user.email} />
                          <input type="hidden" name="confirmation" value="ELIMINAR" />
                          <ConfirmPlatformDeleteButton className="button danger" message={`¿Eliminar definitivamente la cuenta de ${user.email}, sus agencias propias y todos los datos asociados? Esta acción no se puede deshacer.`}>Eliminar titular y datos asociados</ConfirmPlatformDeleteButton>
                        </form>
                      </details>
                    ) : <p className="muted small-text">No se puede eliminar una cuenta sin correo asociado.</p>}
                  </div>
                </details>
              );
            })}
            {users.length === 0 && <p className="muted">No se encontraron cuentas de acceso.</p>}
          </div>
        </section>

        <div className="platform-access-help">
          <h2>Cómo se usa</h2>
          <p>1. El futuro titular se registra desde <Link href="/registro">Crear cuenta de propietario</Link>.</p>
          <p>2. Al confirmar el correo, la persona ve que su solicitud fue recibida. Revisás el alta aquí y elegís Aprobar o Rechazar.</p>
          <p>3. Para cuentas existentes, buscá su agencia en el listado y usá Suspender, Revocar acceso o Reactivar acceso.</p>
          <p className="muted small-text">La cuenta administradora central está protegida para evitar que se bloquee a sí misma desde este panel.</p>
        </div>

        <Link className="button ghost platform-summary-button platform-back-control-button" href="/">Volver a Control de Agencias</Link>
      </section>
    </main>
  );
}