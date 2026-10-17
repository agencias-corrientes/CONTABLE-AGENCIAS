import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function AccessBlockedPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">AUTORIZACIÓN DE PLATAFORMA</p>
          <h1>Acceso no habilitado</h1>
          <p className="muted">Esta cuenta no tiene autorización activa. Contactá al administrador de la plataforma para revisar el estado.</p>
          <Link className="button primary full" href="/login">Volver al inicio de sesión</Link>
        </section>
      </main>
    );
  }

  const { data: statusData, error } = await (supabase as any).rpc("get_platform_access_status");
  if (error) throw new Error("No se pudo comprobar el estado de autorización.");
  const status = typeof statusData === "string" ? statusData : "not_requested";
  if (!["rejected", "suspended", "revoked"].includes(status)) {
    const { data: member } = await supabase
      .from("organization_members").select("organization_id").eq("user_id", String(claims.sub)).limit(1).maybeSingle();
    redirect(member ? "/pagos" : status === "pending" ? "/acceso-pendiente" : "/setup");
  }

  const statusLabel = status === "suspended" ? "suspendido" : status === "revoked" ? "revocado" : "rechazado";
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">AUTORIZACIÓN DE PLATAFORMA</p>
        <h1>Acceso {statusLabel}</h1>
        <p className="muted">Esta cuenta no puede ingresar a la agencia ni operar sus datos mientras la autorización esté {statusLabel}. Los registros guardados no se eliminan por este bloqueo.</p>
        <p className="muted">Contactá al administrador central para solicitar una revisión. No hace falta crear otra cuenta.</p>
        <Link className="button primary full" href="/login?perfil=administrador">Volver al inicio de sesión</Link>
      </section>
    </main>
  );
}
