import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export default async function AccessPendingPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");

  const rpcClient = supabase as any;
  const { data: currentStatus, error } = await rpcClient.rpc("get_platform_access_status");
  if (error) throw new Error("No se pudo comprobar el estado de la solicitud.");
  let status = typeof currentStatus === "string" ? currentStatus : "not_requested";

  if (status === "not_requested") {
    const { data, error: requestError } = await rpcClient.rpc("submit_platform_access_request");
    if (requestError) throw new Error("No se pudo registrar la solicitud de autorización.");
    status = typeof data === "string" ? data : "pending";
  }

  if (["rejected", "suspended", "revoked"].includes(status)) redirect("/acceso-bloqueado");
  if (status === "approved") {
    const { data: member, error: memberError } = await supabase
      .from("organization_members").select("organization_id").eq("user_id", String(claims.sub)).limit(1).maybeSingle();
    if (memberError) throw new Error("No se pudo verificar la agencia vinculada.");
    redirect(member ? "/pagos" : "/setup");
  }

  const email = typeof claims.email === "string" ? claims.email : "tu cuenta";
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-logo-wrap brand-logo-top-left auth-page-logo"><Image src="/icon" alt="Agencias Corrientes — Quiniela Oficial" width={76} height={76} priority /></div>
        <p className="eyebrow">AUTORIZACIÓN DE PLATAFORMA</p>
        <h1>Solicitud pendiente</h1>
        <p className="muted">La cuenta {email} quedó registrada. El administrador central debe aprobar el acceso antes de que puedas crear o administrar una agencia.</p>
        <p className="message">No necesitás volver a registrarte ni solicitar otro correo. Cuando el acceso sea aprobado, ingresá con esta misma cuenta.</p>
        <Link className="button primary full" href="/login?perfil=administrador">Volver al inicio de sesión</Link>
      </section>
    </main>
  );
}
