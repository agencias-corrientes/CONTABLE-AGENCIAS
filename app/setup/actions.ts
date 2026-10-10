"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function bootstrapOrganization(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;

  if (!claims?.sub) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").trim();

  if (!name || name.length > 120) throw new Error("Ingresá un nombre de agencia válido.");

  const { data, error } = await supabase.rpc("bootstrap_agency_organization", {
    p_name: name,
    p_legal_name: legalName || undefined,
    p_tax_id: taxId || undefined,
  });

  if (error) {
    if (/already belongs|ya está asociada|already associated/i.test(error.message)) redirect("/pagos");
    throw new Error("No se pudo configurar la agencia. Revisá los datos e intentá nuevamente.");
  }
  if (!data) throw new Error("No se pudo crear la agencia.");

  redirect("/pagos");
}
