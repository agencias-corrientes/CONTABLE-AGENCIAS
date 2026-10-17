"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function bootstrapOrganization(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;

  if (!claims?.sub) redirect("/login");

  const agencyCode = String(formData.get("agency_code") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").trim();

  if (!/^\d{3}$/.test(agencyCode)) redirect("/setup?error=agencia-invalida");

  // Nombre interno generado a partir del número oficial.
  const name = "Agencia N.º " + agencyCode;

  const { data, error } = await supabase.rpc("bootstrap_agency_organization", {
    p_name: name,
    p_legal_name: legalName || undefined,
    p_tax_id: taxId || undefined,
  });

  if (error) {
    const details = (error.message + " " + (error.details ?? "")).toLowerCase();
    if (details.includes("organizations_agency_code_uq") || details.includes("organizations_agency_number_uq")) redirect("/setup?error=agencia-duplicada");
    if (details.includes("número oficial de agencia")) redirect("/setup?error=agencia-invalida");
    if (/already belongs|ya está asociada|already associated/i.test(details)) redirect("/pagos");
    throw new Error("No se pudo configurar la agencia. Revisá los datos e intentá nuevamente.");
  }
  if (!data) throw new Error("No se pudo crear la agencia.");

  redirect("/pagos");
}
