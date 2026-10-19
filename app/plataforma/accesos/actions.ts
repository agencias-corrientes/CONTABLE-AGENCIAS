"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const allowedStatuses = new Set(["approved", "rejected", "suspended", "revoked"]);

export async function reviewPlatformAccessRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");

  const userId = String(formData.get("user_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const note = String(formData.get("review_note") ?? "").trim().slice(0, 500);
  if (!userId || !allowedStatuses.has(status)) {
    redirect("/plataforma/accesos?error=datos");
  }

  const { error } = await (supabase as any).rpc("review_platform_access_request", {
    p_user_id: userId,
    p_status: status,
    p_note: note || null,
  });
  if (error) {
    revalidatePath("/plataforma/accesos");
    redirect("/plataforma/accesos?error=revision");
  }

  revalidatePath("/plataforma/accesos");
  revalidatePath("/acceso-pendiente");
  revalidatePath("/acceso-bloqueado");
  redirect("/plataforma/accesos?actualizado=1");
}


function errorCode(error: { message?: string } | null | undefined, fallback: string) {
  const message = String(error?.message ?? "").toLowerCase();
  if (message.includes("último administrador")) return "admin_ultimo";
  if (message.includes("escribí exactamente") || message.includes("no coincide") || message.includes("confirmación final") || message.includes("correo escrito")) {
    return fallback.startsWith("usuario") ? "usuario_eliminar_confirmacion" : fallback;
  }
  if (message.includes("titular de una agencia") || message.includes("cuenta creó una agencia") || message.includes("agencia que todavía existe") || message.includes("created_by")) return "usuario_eliminar_agencia";
  if (message.includes("permiso de administrador central")) return "usuario_eliminar_admin";
  if (message.includes("no podés eliminar la cuenta")) return "usuario_eliminar_mismo";
  return fallback;
}
export async function addPlatformAdmin(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect("/plataforma/accesos?error=admin_correo");
  const { error } = await (supabase as any).rpc("add_platform_admin", { p_email: email });
  if (error) redirect("/plataforma/accesos?error=admin_correo");
  revalidatePath("/plataforma/accesos");
  revalidatePath("/");
  redirect("/plataforma/accesos?actualizado=admin_agregado");
}
export async function removePlatformAdmin(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (!email || confirmation !== "QUITAR") redirect("/plataforma/accesos?error=admin_retirar");
  const { error } = await (supabase as any).rpc("remove_platform_admin_confirmed", { p_email: email, p_confirmation: confirmation });
  if (error) redirect("/plataforma/accesos?" + (String(error.message).toLowerCase().includes("último administrador") ? "error=admin_ultimo" : "error=admin_retirar"));
  revalidatePath("/plataforma/accesos");
  revalidatePath("/");
  if (email === String(authData.claims.email ?? "").toLowerCase()) {
    await supabase.auth.signOut();
    redirect("/login?perfil=administrador");
  }
  redirect("/plataforma/accesos?actualizado=admin_retirado");
}
export async function updatePlatformUserName(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const userId = String(formData.get("user_id") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const { error } = await (supabase as any).rpc("update_platform_user_name", { p_user_id: userId, p_full_name: fullName });
  if (error) redirect("/plataforma/accesos?error=usuario_nombre");
  revalidatePath("/plataforma/accesos");
  redirect("/plataforma/accesos?actualizado=nombre_usuario");
}
export async function deletePlatformUser(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const userId = String(formData.get("user_id") ?? "").trim();
  const email = String(formData.get("confirm_email") ?? "").trim().toLowerCase();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (!userId || !email || confirmation !== "ELIMINAR") redirect("/plataforma/accesos?error=usuario_eliminar_confirmacion");
  const { error } = await (supabase as any).rpc("delete_platform_user", { p_user_id: userId, p_confirm_email: email, p_confirmation: confirmation });
  if (error) redirect("/plataforma/accesos?" + errorCode(error, "usuario_eliminar"));
  revalidatePath("/plataforma/accesos");
  revalidatePath("/");
  redirect("/plataforma/accesos?actualizado=usuario_eliminado");
}
export async function updatePlatformAgencyName(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const { error } = await (supabase as any).rpc("update_platform_agency_name", { p_organization_id: organizationId, p_name: name });
  if (error) redirect("/plataforma/accesos?error=agencia_nombre");
  revalidatePath("/plataforma/accesos");
  revalidatePath("/");
  redirect("/plataforma/accesos?actualizado=agencia_editada");
}
export async function updatePlatformAgencyCity(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  if (!organizationId || city.length > 120) redirect("/plataforma/accesos?error=agencia_ciudad");
  const { error } = await (supabase as any).rpc("update_platform_agency_city", {
    p_organization_id: organizationId,
    p_city: city,
  });
  if (error) redirect("/plataforma/accesos?error=agencia_ciudad");
  revalidatePath("/plataforma/accesos");
  revalidatePath("/");
  redirect("/plataforma/accesos?actualizado=ciudad_guardada");
}
export async function transferPlatformAgencyOwner(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const previousOwnerUserId = String(formData.get("previous_owner_user_id") ?? "").trim();
  const newOwnerEmail = String(formData.get("new_owner_email") ?? "").trim().toLowerCase();
  const confirmName = String(formData.get("confirm_name") ?? "").trim();
  if (!organizationId || !previousOwnerUserId || !newOwnerEmail || !confirmName) redirect("/plataforma/accesos?error=agencia_transferir");
  const { error } = await (supabase as any).rpc("transfer_platform_agency_owner", {
    p_organization_id: organizationId, p_previous_owner_user_id: previousOwnerUserId, p_new_owner_email: newOwnerEmail, p_confirm_name: confirmName,
  });
  if (error) redirect("/plataforma/accesos?error=agencia_transferir");
  revalidatePath("/plataforma/accesos");
  revalidatePath("/");
  redirect("/plataforma/accesos?actualizado=titularidad_transferida");
}
export async function deletePlatformAgency(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const confirmName = String(formData.get("confirm_name") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (!organizationId || !confirmName || confirmation !== "ELIMINAR") redirect("/plataforma/accesos?error=agencia_eliminar");
  const { error } = await (supabase as any).rpc("delete_platform_agency", {
    p_organization_id: organizationId, p_confirm_name: confirmName, p_confirmation: confirmation,
  });
  if (error) redirect("/plataforma/accesos?error=agencia_eliminar");
  revalidatePath("/plataforma/accesos");
  revalidatePath("/");
  redirect("/plataforma/accesos?actualizado=agencia_eliminada");
}

export async function updatePlatformAgencyCode(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const agencyCode = String(formData.get("agency_code") ?? "").trim();
  if (!organizationId || !/^\d{3}$/.test(agencyCode)) redirect("/plataforma/accesos?error=agencia_codigo");
  const { error } = await (supabase as any).rpc("update_platform_agency_code", {
    p_organization_id: organizationId,
    p_agency_code: agencyCode,
  });
  if (error) redirect("/plataforma/accesos?error=agencia_codigo");
  revalidatePath("/plataforma/accesos");
  revalidatePath("/");
  redirect("/plataforma/accesos?actualizado=agencia_codigo");
}
