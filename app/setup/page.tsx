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
        <p className="eyebrow">PRIMERA CONFIGURACIÓN</p>
        <h1>Crear empresa</h1>
        <p className="muted">
          Vamos a crear la empresa, su primer período fiscal, centros de costos,
          cuentas contables base y cuentas de caja y banco.
        </p>
        <form action={bootstrapOrganization} className="form-stack">
          <label>Nombre comercial<input name="name" required placeholder="Agencias Corrientes" /></label>
          <label>Razón social<input name="legal_name" placeholder="Razón social" /></label>
          <label>CUIT / identificación fiscal<input name="tax_id" placeholder="20-00000000-0" /></label>
          <button className="button primary full">Crear empresa y comenzar</button>
        </form>
      </div>
    </main>
  );
}
