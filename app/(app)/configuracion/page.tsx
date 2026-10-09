import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/accounting";
import { saveRenditionCutoff } from "./actions";

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; resultado?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, organization, member } = await getCurrentContext();
  if (!organization || !member) redirect("/setup");
  if (member.role !== "owner") redirect("/pagos?error=solo-titular-configuracion");

  const { data: operationalSettings } = await supabase
    .from("agency_operational_settings")
    .select("rendition_cutoff_time,updated_at")
    .eq("organization_id", organization.id)
    .maybeSingle();
  const cutoff = String(operationalSettings?.rendition_cutoff_time ?? "00:00").slice(0, 5);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <p className="eyebrow">SISTEMA</p>
          <h1>Configuración</h1>
          <p className="muted">Parámetros y accesos para {organization.name || "la agencia"}.</p>
        </div>
        <Link href="/pagos" className="button primary">Volver a rendiciones</Link>
      </div>

      {params.resultado === "horario-corte-guardado" && <p className="message success-message">Horario de corte guardado. La nueva jornada empieza a esa hora; el histórico anterior se conserva.</p>}
      {params.error === "horario-corte-invalido" && <p className="message error-message">Elegí una hora válida en formato HH:MM.</p>}
      {params.error === "horario-corte-no-guardado" && <p className="message error-message">No se pudo guardar el horario de corte. No se aplicaron cambios.</p>}

      <section className="panel operational-cutoff-panel">
        <div className="panel-head">
          <div><h2>Reinicio de la rendición diaria</h2><p className="muted">El reinicio pone en cero los totales del día operativo, sin borrar rendiciones ni cobros anteriores.</p></div>
          <span className="badge success">Solo administrador</span>
        </div>
        <form action={saveRenditionCutoff} className="operational-cutoff-form">
          <label>Hora de corte diaria
            <input type="time" name="rendition_cutoff_time" defaultValue={cutoff} required />
          </label>
          <p className="muted small-text">Por defecto es 00:00. Si elegís 03:00, por ejemplo, lo registrado entre medianoche y las 02:59 sigue contando en la jornada anterior. La pantalla se actualiza automáticamente al comenzar la nueva jornada.</p>
          <button className="button primary" type="submit">Guardar horario de corte</button>
        </form>
      </section>

      <section className="panel config-shortcuts-panel">
        <div className="panel-head"><div><h2>Administración de la agencia</h2><p className="muted">Entrá directamente al módulo que necesitás configurar.</p></div></div>
        <div className="settings-grid">
          <Link href="/equipo" className="settings-card"><strong>Personal y permisos</strong><span>Crear empleados, ver sus roles y autorizar operaciones.</span></Link>
          <Link href="/agencias" className="settings-card"><strong>Subagentes y ambulantes</strong><span>Administrar agentes y sus excepciones de comisión.</span></Link>
          <Link href="/juegos" className="settings-card"><strong>Juegos y comisiones generales</strong><span>Editar catálogo y los porcentajes base para todos los agentes.</span></Link>
          <Link href="/loteria-correntina" className="settings-card"><strong>Lotería Correntina</strong><span>Consultar extractos y archivos oficiales.</span></Link>
          <Link href="/configuracion/organizacion" className="settings-card"><strong>Datos de la agencia</strong><span>Datos generales y fiscales.</span></Link>
          <Link href="/configuracion/usuarios" className="settings-card"><strong>Usuarios y roles</strong><span>Revisión de cuentas y perfiles de acceso.</span></Link>
          <Link href="/configuracion/periodos" className="settings-card"><strong>Períodos fiscales</strong><span>Apertura y control de ejercicios.</span></Link>
        </div>
      </section>
    </div>
  );
}
