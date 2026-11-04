import Link from "next/link";
import { getCurrentContext } from "@/lib/accounting";
import { AgencyCodeInput } from "@/components/agency-code-input";
import { createAgencyAgent } from "../actions";

const errorMessages: Record<string, string> = {
  "sin-permiso-alta": "No tenés permiso para dar de alta subagentes o ambulantes.",
  "tipo-invalido": "El tipo de agente seleccionado no es válido.",
  "codigo-invalido": "Ingresá el código con el formato 000-000-00.",
  "nombre-obligatorio": "Ingresá el nombre del subagente o ambulante.",
  "agencia-no-configurada": "Antes de cargar agentes, configurá el número oficial de 3 dígitos en Configuración → Datos de la agencia.",
  "agencia-ajena": "El código debe comenzar con el número oficial de esta agencia. No se creó el registro.",
  "duplicado": "Ese código ya está cargado en esta agencia. No se creó otro registro.",
  "duplicado-global": "Ese código ya pertenece a un subagente o ambulante de otra agencia. No se creó el registro.",
  "alta-fallida": "No se pudo guardar el alta. Revisá los datos y volvé a intentar."
};

export default async function AgenciasAltaPage({
  searchParams,
}: {
  searchParams?: Promise<{ resultado?: string; codigo?: string; error?: string; tipo?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const { supabase, organization, member, userId } = await getCurrentContext();
  if (!organization || !member) return null;

  const isManager = member.role === "owner";
  const { data: staffPermissions } = isManager
    ? { data: { can_create_agents: true } }
    : await supabase
        .from("organization_member_permissions")
        .select("can_create_agents")
        .eq("organization_id", organization.id)
        .eq("user_id", userId)
        .maybeSingle();
  const canCreateAgents = Boolean(staffPermissions?.can_create_agents);

  if (params.resultado === "creado") {
    const typeLabel = params.tipo === "ambulante" ? "ambulante" : "subagente";
    return (
      <div className="agency-create-screen agency-create-success-screen">
        <section className="agency-create-success-card" aria-live="polite">
          <span className="agency-create-success-mark" aria-hidden="true">✓</span>
          <p className="eyebrow">ALTA COMPLETADA</p>
          <h1>¡Agregado correctamente!</h1>
          <p>El {typeLabel} {params.codigo || ""} ya está registrado en tu agencia.</p>
          <div className="agency-create-success-actions">
            <Link href="/inicio" className="button primary agency-create-next-button">Volver al panel general</Link>
            <Link href="/pagos" className="button primary agency-create-next-button">Ir a Rendiciones</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="agency-create-screen">
      <div className="agency-create-screen-heading">
        <p className="eyebrow">ADMINISTRACIÓN DE AGENTES</p>
        <h1>Agregar subagente o ambulante</h1>
        <p className="muted">Completá los datos para dar de alta un nuevo operador.</p>
      </div>
      <section className="agency-create-screen-card">
        {!canCreateAgents ? (
          <div className="agency-create-restricted">
            <h2>Alta de agentes restringida</h2>
            <p>El titular debe habilitarte el permiso para agregar subagentes o ambulantes.</p>
          </div>
        ) : (
          <>
            {params.error && <p className="message error-message" role="alert">{errorMessages[params.error] ?? "No se pudo completar el alta. Revisá los datos e intentá nuevamente."}</p>}
            <form action={createAgencyAgent} className="agency-create-screen-form">
              <label>
                Tipo de operador
                <select name="kind" defaultValue={params.tipo === "ambulante" ? "ambulant" : "subagent"} required>
                  <option value="subagent">Subagente</option>
                  <option value="ambulant">Ambulante</option>
                </select>
              </label>
              <label>
                Código
                <AgencyCodeInput name="code" defaultValue={params.codigo ?? ""} />
              </label>
              <label className="agency-create-name-field">
                Nombre y apellido
                <input name="full_name" placeholder="Nombre y apellido" autoComplete="name" required />
              </label>
              <label>
                DNI
                <input name="dni" inputMode="numeric" placeholder="DNI" />
              </label>
              <label>
                Teléfono
                <input name="phone" type="tel" inputMode="tel" placeholder="Teléfono" />
              </label>
              <label>
                WhatsApp
                <input name="whatsapp" type="tel" inputMode="tel" placeholder="WhatsApp" />
              </label>
              <button className="button primary agency-create-submit" type="submit">Agregar subagente o ambulante</button>
            </form>
            <p className="agency-create-code-help">El código se completa automáticamente con guiones. Formato: 000-000-00.</p>
          </>
        )}
      </section>
    </div>
  );
}
