import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/accounting";
import { updateAgencyProfile, deleteAgencyProfile } from "./actions";

export default async function OrganizacionPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; resultado?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { organization, member } = await getCurrentContext();
  if (!organization || !member) redirect("/setup");

  if (member.role !== "owner") {
    return <div className="page"><div className="topbar"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Datos de la agencia</h1><p className="muted">Datos generales de la organización.</p></div><Link href="/configuracion" className="button ghost">Volver a Configuración</Link></div>
      <section className="panel"><div className="detail-grid"><div><span className="muted">Nombre</span><strong>{organization.name}</strong></div><div><span className="muted">Razón social</span><strong>{organization.legal_name || "No definida"}</strong></div><div><span className="muted">CUIT / identificación</span><strong>{organization.tax_id || "No definido"}</strong></div><div><span className="muted">Moneda</span><strong>{organization.currency_code || "ARS"}</strong></div><div><span className="muted">Zona horaria</span><strong>{organization.timezone}</strong></div></div><p className="muted">Solo el titular puede modificar o eliminar los datos de la agencia.</p></section>
    </div>;
  }

  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Datos de la agencia</h1><p className="muted">Modificá los datos generales. La eliminación completa está separada y exige contraseña y confirmación exacta.</p></div><Link href="/configuracion" className="button ghost">Volver a Configuración</Link></div>
    {params.resultado === "datos-guardados" && <p className="message success-message">Los datos de la agencia se guardaron correctamente.</p>}
    {params.error && <p className="message error-message">{({
      "datos-invalidos": "Revisá el nombre, la moneda y la zona horaria.",
      "datos-no-guardados": "No se pudieron guardar los datos de la agencia.",
      "solo-titular": "Solo el titular puede realizar esta operación.",
      "confirmacion-no-valida": "Escribí exactamente ELIMINAR: seguido del nombre actual de la agencia.",
      "contrasena-incorrecta": "La contraseña del titular no coincide. No se eliminó nada.",
      "verificacion-fallida": "No se pudo verificar la sesión del titular.",
      "archivos-no-eliminados": "No se pudieron limpiar los archivos adjuntos. La agencia se conservó y no se eliminó.",
      "agencia-no-eliminada": "No se pudo eliminar la agencia. Los datos de la base se conservaron."
    } as Record<string, string>)[params.error] ?? "No se pudo completar la operación."}</p>}

    <section className="panel agency-profile-edit-panel">
      <div className="panel-head"><div><h2>Modificar datos de la agencia</h2><p className="muted">Estos cambios no borran rendiciones, cobros ni historial.</p></div><span className="badge success">Titular</span></div>
      <form action={updateAgencyProfile} className="agency-profile-edit-form">
        <label>Nombre de la agencia<input name="name" defaultValue={organization.name} maxLength={120} required /></label>
        <label>Razón social<input name="legal_name" defaultValue={organization.legal_name ?? ""} maxLength={180} /></label>
        <label>CUIT / identificación<input name="tax_id" defaultValue={organization.tax_id ?? ""} maxLength={40} /></label>
        <label>Moneda (ISO de 3 letras)<input name="currency_code" defaultValue={String(organization.currency_code ?? "ARS").trim()} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" required /></label>
        <label>Zona horaria
          <select name="timezone" defaultValue={organization.timezone ?? "America/Argentina/Cordoba"} required>
          <option value="America/Argentina/Buenos_Aires">Buenos Aires</option>
          <option value="America/Argentina/Catamarca">Catamarca</option>
          <option value="America/Argentina/ComodRivadavia">Comodoro Rivadavia</option>
          <option value="America/Argentina/Cordoba">Corrientes / Córdoba</option>
          <option value="America/Argentina/Jujuy">Jujuy</option>
          <option value="America/Argentina/La_Rioja">La Rioja</option>
          <option value="America/Argentina/Mendoza">Mendoza</option>
          <option value="America/Argentina/Rio_Gallegos">Río Gallegos</option>
          <option value="America/Argentina/Salta">Salta</option>
          <option value="America/Argentina/San_Juan">San Juan</option>
          <option value="America/Argentina/San_Luis">San Luis</option>
          <option value="America/Argentina/Tucuman">Tucumán</option>
          <option value="America/Argentina/Ushuaia">Ushuaia</option>
          </select>
        </label>
        <button className="button primary" type="submit">Guardar modificaciones</button>
      </form>
    </section>

    <section className="panel agency-delete-panel">
      <div className="panel-head"><div><h2>Eliminar los datos de la agencia</h2><p className="muted">Acción irreversible: elimina la agencia, su personal vinculado, agentes, rendiciones, cobros, caja, juegos, comisiones, configuraciones e historial asociado. No elimina las cuentas globales de inicio de sesión.</p></div><span className="badge warning">Irreversible</span></div>
      <form action={deleteAgencyProfile} className="agency-delete-form">
        <label>Contraseña actual del titular<input type="password" name="password" autoComplete="current-password" required /></label>
        <label>Escribí exactamente: <strong>{"ELIMINAR: " + organization.name}</strong><input name="confirmation" placeholder={"ELIMINAR: " + organization.name} autoComplete="off" required /></label>
        <label className="agency-delete-confirm"><input type="checkbox" name="confirm_delete" value="yes" required /> Entiendo que se borrarán todos los datos de esta agencia y que no se puede deshacer.</label>
        <button className="button danger" type="submit">Eliminar agencia y todos sus datos</button>
      </form>
    </section>
  </div>;
}
