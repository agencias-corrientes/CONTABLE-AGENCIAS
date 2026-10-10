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
      <section className="panel"><div className="detail-grid"><div><span className="muted">Nombre</span><strong>{organization.name}</strong></div><div><span className="muted">Razón social</span><strong>{organization.legal_name || "No definida"}</strong></div><div><span className="muted">CUIT / identificación</span><strong>{organization.tax_id || "No definido"}</strong></div><div><span className="muted">Moneda</span><strong>{organization.currency_code || "ARS"}</strong></div></div><p className="muted">Solo el titular puede modificar o eliminar los datos de la agencia.</p></section>
    </div>;
  }

  return <div className="page">
    <div className="topbar"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Datos de la agencia</h1><p className="muted">Modificá el nombre, la razón social, la identificación y la moneda de la agencia.</p></div><Link href="/configuracion" className="button ghost">Volver a Configuración</Link></div>
    {params.resultado === "datos-guardados" && <p className="message success-message">Los datos de la agencia se guardaron correctamente.</p>}
    {params.error && <p className="message error-message">{({
      "datos-invalidos": "Revisá el nombre y el código de moneda.",
      "datos-no-guardados": "No se pudieron guardar los datos de la agencia.",
      "solo-titular": "Solo el titular puede realizar esta operación.",
      "confirmacion-no-valida": "Escribí exactamente ELIMINAR: seguido del nombre actual de la agencia.",
      "contrasena-incorrecta": "La contraseña del titular no coincide. No se eliminó nada.",
      "verificacion-fallida": "No se pudo verificar la sesión del titular.",
      "archivos-no-eliminados": "No se pudieron limpiar los archivos adjuntos. La agencia se conservó y no se eliminó.",
      "agencia-no-eliminada": "No se pudo eliminar la agencia. Los datos de la base se conservaron.",
      "cuenta-vinculada-otra-agencia": "Esta cuenta tiene acceso a más de una agencia. No se eliminó nada para evitar dejar otra agencia sin titular.",
      "eliminacion-no-completada": "No se pudo completar la baja. Revisá la conexión e intentá nuevamente.",
      "cuenta-no-eliminada": "La agencia se eliminó, pero no se pudo borrar la cuenta de acceso. Ingresá nuevamente y contactá al soporte antes de registrarte otra vez."
    } as Record<string, string>)[params.error] ?? "No se pudo completar la operación."}</p>}

    <section className="panel agency-profile-edit-panel">
      <div className="panel-head"><div><h2>Modificar datos de la agencia</h2><p className="muted">Estos cambios no borran rendiciones, cobros ni historial.</p></div><span className="badge success">Titular</span></div>
      <form action={updateAgencyProfile} className="agency-profile-edit-form">
        <label>Nombre de la agencia<input name="name" defaultValue={organization.name} maxLength={120} required /></label>
        <label>Razón social<input name="legal_name" defaultValue={organization.legal_name ?? ""} maxLength={180} /></label>
        <label>CUIT / identificación<input name="tax_id" defaultValue={organization.tax_id ?? ""} maxLength={40} /></label>
        <label>Moneda (ISO de 3 letras)<input name="currency_code" defaultValue={String(organization.currency_code ?? "ARS").trim()} minLength={3} maxLength={3} pattern="[A-Za-z]{3}" required /></label>
        <button className="button primary" type="submit">Guardar modificaciones</button>
      </form>
    </section>

    <section className="panel agency-delete-panel">
      <div className="panel-head"><div><h2>Eliminar los datos de la agencia</h2><p className="muted">Acción irreversible: elimina la agencia y sus datos asociados, y también la cuenta de inicio de sesión del titular para que el correo pueda registrarse nuevamente. No se puede deshacer.</p></div><span className="badge warning">Irreversible</span></div>
      <form action={deleteAgencyProfile} className="agency-delete-form">
        <label>Contraseña actual del titular<input type="password" name="password" autoComplete="current-password" required /></label>
        <label>Escribí exactamente: <strong>{"ELIMINAR: " + organization.name}</strong><input name="confirmation" placeholder={"ELIMINAR: " + organization.name} autoComplete="off" required /></label>
        <label className="agency-delete-confirm"><input type="checkbox" name="confirm_delete" value="yes" required /> Entiendo que se borrarán los datos de esta agencia y mi cuenta de inicio de sesión; esta acción no se puede deshacer.</label>
        <button className="button danger" type="submit">Eliminar agencia y cuenta del titular</button>
      </form>
    </section>
  </div>;
}
