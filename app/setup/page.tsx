import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/accounting";
import { bootstrapOrganization } from "./actions";

export default async function SetupPage() {
  const { member } = await getCurrentContext();
  if (member) redirect("/pagos");

  return (
    <main className="auth-page">
      <div className="auth-card wide">
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">PRIMERA CONFIGURACIÓN</p>
        <h1>Configurar tu agencia</h1>
        <p className="muted">
          Este paso crea una agencia independiente para tu cuenta, carga el catálogo oficial de juegos
          y prepara Caja y los ajustes operativos básicos. No se crean subagentes ni rendiciones de prueba.
        </p>
        <form action={bootstrapOrganization} className="form-stack">
          <label>Nombre de la agencia<input name="name" required maxLength={120} placeholder="Agencia N.º 251" /></label>
          <label>Razón social (opcional)<input name="legal_name" maxLength={160} placeholder="Razón social" /></label>
          <label>CUIT / identificación fiscal (opcional)<input name="tax_id" maxLength={32} placeholder="CUIT" /></label>
          <button className="button primary full">Crear agencia y comenzar</button>
          <p className="muted small-text">La cuenta que registraste quedará como titular. Podrás habilitar empleados después desde la administración de equipo.</p>
        </form>
      </div>
    </main>
  );
}
