"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const AGENCY_TIME_ZONE = "America/Argentina/Cordoba";

async function getAgencyOwnerContext() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: member, error } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !member) redirect("/setup");
  if (member.role !== "owner") redirect("/configuracion/organizacion?error=solo-titular");

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id,name")
    .eq("id", member.organization_id)
    .maybeSingle();
  if (organizationError || !organization) redirect("/configuracion/organizacion?error=agencia-no-encontrada");

  return {
    supabase,
    organizationId: String(organization.id),
    organizationName: String(organization.name),
    claims: authData.claims,
  };
}

export async function updateAgencyProfile(formData: FormData) {
  const { supabase, organizationId } = await getAgencyOwnerContext();
  const name = String(formData.get("name") ?? "").trim();
  const legalName = String(formData.get("legal_name") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").trim();
  const currencyCode = String(formData.get("currency_code") ?? "").trim().toUpperCase();

  if (!name || name.length > 120 || legalName.length > 180 || taxId.length > 40 ||
      !/^[A-Z]{3}$/.test(currencyCode)) {
    redirect("/configuracion/organizacion?error=datos-invalidos");
  }

  const { error } = await (supabase as any).rpc("update_agency_profile", {
    p_organization_id: organizationId,
    p_name: name,
    p_legal_name: legalName || null,
    p_tax_id: taxId || null,
    p_currency_code: currencyCode,
    p_timezone: AGENCY_TIME_ZONE,
  });

  if (error) {
    if (error.code === "42501") redirect("/configuracion/organizacion?error=solo-titular");
    redirect("/configuracion/organizacion?error=datos-no-guardados");
  }

  revalidatePath("/configuracion/organizacion");
  revalidatePath("/configuracion");
  revalidatePath("/dashboard");
  redirect("/configuracion/organizacion?resultado=datos-guardados");
}

export async function deleteAgencyProfile(formData: FormData) {
  const { supabase, organizationId, organizationName } = await getAgencyOwnerContext();
  const confirmation = String(formData.get("confirmation") ?? "");
  const password = String(formData.get("password") ?? "");

  if (formData.get("confirm_delete") !== "yes" || confirmation !== "ELIMINAR: " + organizationName) {
    redirect("/configuracion/organizacion?error=confirmacion-no-valida");
  }
  if (!password) redirect("/configuracion/organizacion?error=verificacion-fallida");

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; code?: string }>(
    "delete-agency-and-owner",
    { body: { organization_id: organizationId, confirmation, password } }
  );

  if (error || !data?.ok) {
    let code = data?.code ?? "";
    try {
      const context = (error as unknown as { context?: Response } | null)?.context;
      if (context) {
        const payload = await context.clone().json() as { code?: string };
        code = payload.code ?? code;
      }
    } catch {
      // The edge function may return an empty or non-JSON response; use a safe generic message.
    }

    if (code === "password_verification_failed") redirect("/configuracion/organizacion?error=contrasena-incorrecta");
    if (code === "owner_required") redirect("/configuracion/organizacion?error=solo-titular");
    if (code === "confirmation_mismatch") redirect("/configuracion/organizacion?error=confirmacion-no-valida");
    if (code === "account_linked_to_other_agencies") redirect("/configuracion/organizacion?error=cuenta-vinculada-otra-agencia");
    if (code === "agency_files_cleanup_failed") redirect("/configuracion/organizacion?error=archivos-no-eliminados");
    if (code === "agency_delete_failed") redirect("/configuracion/organizacion?error=agencia-no-eliminada");
    if (code === "agency_deleted_account_remains") redirect("/login?error=cuenta-no-eliminada");
    redirect("/configuracion/organizacion?error=eliminacion-no-completada");
  }

  revalidatePath("/configuracion");
  revalidatePath("/dashboard");
  redirect("/login?mensaje=agencia-y-cuenta-eliminadas");
}
