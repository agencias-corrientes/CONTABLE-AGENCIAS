import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/accounting";
import { bootstrapOrganization } from "./actions";

export default async function SetupPage() {
  const { member } = await getCurrentContext();
  if (member) redirect("/dashboard");

  return (
    <main className="auth-page">
      <div className="auth-card wide">
        <div className="brand-mark small">AC</div>
        <p className="eyebrow">CONFIGURACIÓN DE AGENCIA</p>
        <h1>Crear agencia oficial</h1>
        <p className="muted">
          Registrá los datos de la agencia desde la que se controlan las rendiciones de subagentes y ambulantes.
        </p>
        <form action={bootstrapOrganization} className="form-stack">
          <label>Nombre de la agencia<input name="name" required placeholder="AGENCIA 251" /></label>
          <label>Razón social<input name="legal_name" placeholder="Razón social" /></label>
          <label>CUIT / identificación fiscal<input name="tax_id" placeholder="20-00000000-0" /></label>
          <button className="button primary full">Crear agencia y comenzar</button>
        </form>
      </div>
    </main>
  );
}
