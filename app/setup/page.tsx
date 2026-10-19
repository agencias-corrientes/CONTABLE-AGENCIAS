import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentContext } from "@/lib/accounting";
import { bootstrapOrganization } from "./actions";

export default async function SetupPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const { supabase, member } = await getCurrentContext();
  if (member) redirect("/pagos");

  const rpcClient = supabase as any;
  const { data: initialStatus, error: statusError } = await rpcClient.rpc("get_platform_access_status");
  if (statusError) throw new Error("No se pudo comprobar la autorización central para crear la agencia.");
  let status = typeof initialStatus === "string" ? initialStatus : "not_requested";

  if (status === "not_requested") {
    const { data: requestedStatus, error: requestError } = await rpcClient.rpc("submit_platform_access_request");
    if (requestError) throw new Error("No se pudo registrar la solicitud de acceso.");
    status = typeof requestedStatus === "string" ? requestedStatus : "pending";
  }

  if (["rejected", "suspended", "revoked"].includes(status)) redirect("/acceso-bloqueado");
  if (status !== "approved") redirect("/acceso-pendiente");

  return (
    <main className="auth-page">
      <div className="auth-card wide">
        <div className="brand-logo-wrap brand-logo-top-left auth-page-logo"><Image src="/icon" alt="Agencias Corrientes — Quiniela Oficial" width={96} height={96} priority /></div>
        <p className="eyebrow">PRIMERA CONFIGURACIÓN</p>
        <h1>Configurar tu agencia</h1>
        {params.error === "agencia-duplicada" && <p className="message error-message" role="alert">Ese número oficial de agencia ya está registrado por otro titular. No se creó una segunda agencia. Verificá el número o contactá Administración Central.</p>}
        {params.error === "agencia-invalida" && <p className="message error-message" role="alert">Ingresá el número oficial de agencia con exactamente 3 dígitos.</p>}
        <p className="muted">
          Este paso crea una agencia independiente para tu cuenta, carga el catálogo oficial de juegos
          y prepara Caja y los ajustes operativos básicos. No se crean subagentes ni rendiciones de prueba.
        </p>
        <form action={bootstrapOrganization} className="form-stack">
          <label>Número oficial de agencia<input name="agency_code" type="text" inputMode="numeric" minLength={3} maxLength={3} pattern="[0-9]{3}" placeholder="251" required /></label>
          <label>Razón social (opcional)<input name="legal_name" maxLength={160} placeholder="Razón social" /></label>
          <label>CUIT / identificación fiscal (opcional)<input name="tax_id" maxLength={32} placeholder="CUIT" /></label>
          <button className="button primary full">Crear agencia y comenzar</button>
          <p className="muted small-text">La cuenta que registraste quedará como titular. Podrás habilitar empleados después desde la administración de equipo.</p>
        </form>
      </div>
    </main>
  );
}
