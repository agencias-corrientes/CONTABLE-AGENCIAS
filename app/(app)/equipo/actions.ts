"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getOwnerContext() {
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
  if (member.role !== "owner") redirect("/equipo?error=solo-titular");
  return { supabase, organizationId: member.organization_id, userId: String(userId) };
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

export async function addEmployeeByEmail(formData: FormData) {
  const { supabase, organizationId } = await getOwnerContext();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/equipo?error=email-invalido");
  }

  const { error } = await supabase.rpc("add_organization_member_by_email", {
    p_organization_id: organizationId,
    p_email: email,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("debe registrarse") || message.includes("no encontramos")) {
      redirect("/equipo?error=cuenta-no-registrada");
    }
    if (message.includes("ya pertenece")) redirect("/equipo?error=empleado-existente");
    redirect("/equipo?error=alta-empleado-fallida");
  }

  revalidatePath("/equipo");
  redirect("/equipo?resultado=empleado-agregado");
}

export async function saveEmployeePermissions(formData: FormData) {
  const { supabase, organizationId, userId } = await getOwnerContext();
  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!targetUserId || targetUserId === userId) redirect("/equipo?error=usuario-invalido");

  const { data: target, error: targetError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetError || !target) redirect("/equipo?error=usuario-no-encontrado");
  if (target.role === "owner") redirect("/equipo?error=no-se-puede-modificar-titular");

  const permissions = {
    organization_id: organizationId,
    user_id: targetUserId,
    can_create_agents: checked(formData, "can_create_agents"),
    can_delete_agents: checked(formData, "can_delete_agents"),
    can_create_renditions: checked(formData, "can_create_renditions"),
    can_edit_renditions: checked(formData, "can_edit_renditions"),
    can_delete_renditions: checked(formData, "can_delete_renditions"),
    can_register_payments: checked(formData, "can_register_payments"),
    can_manage_backups: checked(formData, "can_manage_backups"),
    created_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("organization_member_permissions")
    .upsert(permissions, { onConflict: "organization_id,user_id" });
  if (error) redirect("/equipo?error=permisos-no-guardados");

  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    user_id: userId,
    action: "update_employee_permissions",
    entity: "organization_member",
    entity_id: targetUserId,
    payload: { permissions: {
      can_create_agents: permissions.can_create_agents,
      can_delete_agents: permissions.can_delete_agents,
      can_create_renditions: permissions.can_create_renditions,
      can_edit_renditions: permissions.can_edit_renditions,
      can_delete_renditions: permissions.can_delete_renditions,
      can_register_payments: permissions.can_register_payments,
      can_manage_backups: permissions.can_manage_backups,
    } },
  });

  revalidatePath("/equipo");
  revalidatePath("/agencias");
  revalidatePath("/pagos");
  redirect("/equipo?resultado=permisos-guardados");
}

export async function removeEmployeeAccess(formData: FormData) {
  const { supabase, organizationId, userId } = await getOwnerContext();
  const targetUserId = String(formData.get("user_id") ?? "").trim();
  if (!targetUserId || targetUserId === userId || formData.get("confirm_remove") !== "yes") {
    redirect("/equipo?error=usuario-invalido");
  }

  const { data: target, error: targetError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetError || !target) redirect("/equipo?error=usuario-no-encontrado");
  if (target.role === "owner") redirect("/equipo?error=no-se-puede-modificar-titular");

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId);
  if (error) redirect("/equipo?error=acceso-no-revocado");

  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    user_id: userId,
    action: "remove_employee_access",
    entity: "organization_member",
    entity_id: targetUserId,
    payload: { revoked: true },
  });
  revalidatePath("/equipo");
  redirect("/equipo?resultado=acceso-revocado");
}
