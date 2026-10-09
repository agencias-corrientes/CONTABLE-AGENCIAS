"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createPublicAuthClient } from "@supabase/supabase-js";

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
  const timezone = String(formData.get("timezone") ?? "").trim();

  if (!name || name.length > 120 || legalName.length > 180 || taxId.length > 40 ||
      !/^[A-Z]{3}$/.test(currencyCode) || !timezone || timezone.length > 80) {
    redirect("/configuracion/organizacion?error=datos-invalidos");
  }

  const { error } = await (supabase as any).rpc("update_agency_profile", {
    p_organization_id: organizationId,
    p_name: name,
    p_legal_name: legalName || null,
    p_tax_id: taxId || null,
    p_currency_code: currencyCode,
    p_timezone: timezone,
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

async function removeAgencyTicketPhotos(supabase: any, organizationId: string): Promise<boolean> {
  try {
    const bucket = supabase.storage.from("agency-rendition-tickets");
    const { data: topLevel, error: listError } = await bucket.list(organizationId, { limit: 1000 });
    if (listError) return false;

    const paths: string[] = [];
    for (const item of (topLevel ?? []) as Array<{ name: string; id?: string | null }>) {
      if (item.id) {
        paths.push(organizationId + "/" + item.name);
        continue;
      }
      const { data: children, error: childError } = await bucket.list(organizationId + "/" + item.name, { limit: 1000 });
      if (childError) return false;
      for (const file of (children ?? []) as Array<{ name: string; id?: string | null }>) {
        if (file.id) paths.push(organizationId + "/" + item.name + "/" + file.name);
      }
    }

    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await bucket.remove(paths.slice(i, i + 100));
      if (error) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function deleteAgencyProfile(formData: FormData) {
  const { supabase, organizationId, organizationName, claims } = await getAgencyOwnerContext();
  const confirmation = String(formData.get("confirmation") ?? "");
  const password = String(formData.get("password") ?? "");

  if (formData.get("confirm_delete") !== "yes" || confirmation !== "ELIMINAR: " + organizationName) {
    redirect("/configuracion/organizacion?error=confirmacion-no-valida");
  }

  const email = typeof claims.email === "string" ? claims.email : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!email || !url || !publishableKey || !password) {
    redirect("/configuracion/organizacion?error=verificacion-fallida");
  }

  const verifier = createPublicAuthClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: authError } = await verifier.auth.signInWithPassword({ email, password });
  if (authError) redirect("/configuracion/organizacion?error=contrasena-incorrecta");

  // Do not orphan private ticket files if the storage operation cannot complete.
  if (!(await removeAgencyTicketPhotos(supabase, organizationId))) {
    redirect("/configuracion/organizacion?error=archivos-no-eliminados");
  }

  const { error } = await (supabase as any).rpc("delete_agency_organization", {
    p_organization_id: organizationId,
    p_confirmation: confirmation,
  });
  if (error) {
    if (error.code === "42501") redirect("/configuracion/organizacion?error=solo-titular");
    redirect("/configuracion/organizacion?error=agencia-no-eliminada");
  }

  revalidatePath("/configuracion");
  revalidatePath("/dashboard");
  redirect("/login?mensaje=agencia-eliminada");
}
