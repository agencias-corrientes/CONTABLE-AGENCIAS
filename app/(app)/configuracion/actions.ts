"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveRenditionCutoff(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError || !member) redirect("/setup");
  if (member.role !== "owner") redirect("/pagos?error=solo-titular-configuracion");

  const cutoff = String(formData.get("rendition_cutoff_time") ?? "").trim();
  const backupSendTime = String(formData.get("backup_send_time") ?? "").trim();
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!validTime.test(cutoff) || !validTime.test(backupSendTime)) {
    redirect("/configuracion?error=horario-configuracion-invalida");
  }

  const { error } = await supabase.from("agency_operational_settings").upsert({
    organization_id: member.organization_id,
    rendition_cutoff_time: cutoff,
    backup_send_time: backupSendTime,
    updated_by: String(userId),
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });

  if (error) redirect("/configuracion?error=horarios-no-guardados");

  await supabase.from("audit_log").insert({
    organization_id: member.organization_id,
    user_id: String(userId),
    action: "update_agency_operational_schedules",
    entity: "agency_operational_settings",
    entity_id: String(member.organization_id),
    payload: { rendition_cutoff_time: cutoff, backup_send_time: backupSendTime },
  });

  revalidatePath("/configuracion");
  revalidatePath("/pagos");
  revalidatePath("/agencias");
  redirect("/configuracion?resultado=horarios-guardados");
}
