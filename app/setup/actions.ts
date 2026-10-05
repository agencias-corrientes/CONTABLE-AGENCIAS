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
  const startDate = String(formData.get("start_date") ?? "").trim() || new Date().toISOString().slice(0, 10);

  if (!name) throw new Error("El nombre de la empresa es obligatorio.");

  const { data, error } = await supabase.rpc("bootstrap_organization", {
    p_name: name,
    p_legal_name: legalName || undefined,
    p_tax_id: taxId || undefined,
    p_start_date: startDate,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se pudo crear la organización.");

  redirect("/dashboard");
}
