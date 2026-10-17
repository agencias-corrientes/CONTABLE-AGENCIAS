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
    console.error("[setup] bootstrap_agency_organization failed", {
      code: error.code ?? null,
      message: error.message,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    if (/already belongs|ya está asociada|already associated/i.test(error.message)) redirect("/pagos");
    redirect("/setup?error=creation_failed");
  }
  if (!data) {
    console.error("[setup] bootstrap_agency_organization returned no organization id");
    redirect("/setup?error=creation_failed");
  }

  redirect("/pagos");
}
