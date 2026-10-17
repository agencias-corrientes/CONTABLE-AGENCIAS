import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { reviewPlatformAccessRequest } from "./actions";

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

  const [{ data: requestData, error: requestError }, { data: accountData, error: accountError }] = await Promise.all([
    (supabase as any).rpc("list_platform_access_requests"),
    (supabase as any).rpc("list_platform_agencies_and_users"),
  ]);
  if (requestError) throw new Error("No se pudieron cargar las solicitudes de acceso.");
  if (accountError) throw new Error("No se pudo cargar el listado de agencias y cuentas existentes.");

  const requests = (Array.isArray(requestData) ? requestData : []) as AccessRequest[];
  const accounts = (Array.isArray(accountData) ? accountData : []) as PlatformAccount[];
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
  const accountCount = new Set(accounts.map((account) => account.user_id).filter(Boolean)).size;

  return (
    <main className="auth-page">
      <section className="auth-card wide">
        <p className="eyebrow">ADMINISTRACIÓN CENTRAL</p>
        <h1>Control de acceso a agencias</h1>
        <p className="muted">Este es el panel central. Las solicitudes nuevas aparecen arriba; las agencias y cuentas que ya existían se administran en el listado de abajo. Suspender o revocar bloquea el acceso, pero no elimina rendiciones ni movimientos guardados.</p>

        <div className="button-row platform-access-summary">
          <span className="user-role-pill">Solicitudes pendientes: {requests.length}</span>
          <span className="user-role-pill">Agencias registradas: {agencies.length}</span>
          <span className="user-role-pill">Cuentas encontradas: {accountCount}</span>
        </div>

        {params.actualizado === "1" && <p className="message">Se actualizó el estado de acceso.</p>}
        {params.error && <p className="message error-message">No se pudo aplicar el cambio. Revisá el estado de la cuenta, la conexión y que tu usuario conserve el permiso de administrador central.</p>}

        <section className="platform-access-section">
          <h2>1. Solicitudes de alta pendientes</h2>
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
          <h2>2. Agencias y sus usuarios</h2>
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

        {unlinkedAccounts.length > 0 && (
          <section className="platform-access-section">
            <h2>3. Cuentas autorizadas sin agencia vinculada</h2>
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
          <p className="muted small-text">La cuenta administradora central está protegida para evitar que se bloquee a sí misma desde este panel. Antes de entregar el sistema a su titular definitivo, se debe actualizar la identidad autorizada en la configuración central.</p>
        </div>

        <Link href="/login?perfil=administrador">Volver</Link>
      </section>
    </main>
  );
}
