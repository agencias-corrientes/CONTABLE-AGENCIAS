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

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(date);
}

export default async function PlatformAccessPage({ searchParams }: { searchParams: Promise<{ actualizado?: string; error?: string }> }) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");

  const { data: isAdmin, error: adminError } = await (supabase as any).rpc("is_platform_admin");
  if (adminError) throw new Error("No se pudo verificar el permiso de administrador central.");
  if (isAdmin !== true) redirect("/login?perfil=administrador");

  const { data, error } = await (supabase as any).rpc("list_platform_access_requests");
  if (error) throw new Error("No se pudieron cargar las solicitudes de acceso.");
  const requests = (Array.isArray(data) ? data : []) as AccessRequest[];
  const params = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card wide">
        <p className="eyebrow">ADMINISTRACIÓN CENTRAL</p>
        <h1>Control de acceso a agencias</h1>
        <p className="muted">Desde aquí se aprueba quién puede crear una agencia y se puede suspender o revocar el acceso de una cuenta. La suspensión no borra rendiciones ni movimientos guardados.</p>
        {params.actualizado === "1" && <p className="message">Se actualizó el estado de acceso.</p>}
        {params.error && <p className="message error-message">No se pudo aplicar la revisión. Verificá que la solicitud exista y que tu cuenta conserve el rol de administrador central.</p>}
        {requests.length === 0 ? (
          <p className="muted">Todavía no hay solicitudes registradas.</p>
        ) : (
          <div className="form-stack">
            {requests.map((request) => (
              <article key={request.user_id} className="auth-card access-request-card">
                <div>
                  <strong>{request.full_name || "Sin nombre informado"}</strong>
                  <p>{request.email}</p>
                  <p className="muted small-text">Estado: {request.status} · Solicitud: {dateLabel(request.requested_at)}</p>
                  {request.reviewed_at && <p className="muted small-text">Revisado: {dateLabel(request.reviewed_at)} · Por: {request.reviewed_by || "—"}</p>}
                  {request.review_note && <p className="muted small-text">Nota: {request.review_note}</p>}
                </div>
                <form action={reviewPlatformAccessRequest} className="form-stack">
                  <input type="hidden" name="user_id" value={request.user_id} />
                  <label>Nota de revisión (opcional)<input name="review_note" maxLength={500} defaultValue={request.review_note || ""} /></label>
                  <div className="button-row">
                    <button className="button primary" name="status" value="approved">Aprobar</button>
                    <button className="button secondary" name="status" value="rejected">Rechazar</button>
                    <button className="button secondary" name="status" value="suspended">Suspender</button>
                    <button className="button secondary" name="status" value="revoked">Revocar</button>
                  </div>
                </form>
              </article>
            ))}
          </div>
        )}
        <p className="muted small-text">La cuenta administradora central debe mantenerse bajo control del titular del sistema y ajustarse antes de la entrega definitiva.</p>
        <Link href="/login?perfil=administrador">Volver</Link>
      </section>
    </main>
  );
}
