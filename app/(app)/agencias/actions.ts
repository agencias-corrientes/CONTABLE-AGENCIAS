"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function getOrg() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: member } = await supabase.from("organization_members").select("organization_id").eq("user_id", claims.sub).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!member) throw new Error("No hay una empresa configurada.");
  return { supabase, organizationId: member.organization_id };
}

export async function createAgencyAgent(formData: FormData) {
  const { supabase, organizationId } = await getOrg();
  const kind = String(formData.get("kind") ?? "subagent") as "subagent" | "ambulant";
  const code = String(formData.get("code") ?? "").trim();
  if (!["subagent", "ambulant"].includes(kind)) throw new Error("Tipo de agencia inválido.");
  if (!/^\d{3}-\d{3}-\d{2}$/.test(code)) throw new Error("El código debe tener el formato 251-010-01.");
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) throw new Error("El nombre es obligatorio.");

  const { error } = await supabase.rpc("create_agency_agent", {
    p_organization_id: organizationId,
    p_kind: kind,
    p_full_name: fullName,
    p_code: code,
    p_dni: String(formData.get("dni") ?? "").trim() || undefined,
    p_phone: String(formData.get("phone") ?? "").trim() || undefined,
    p_whatsapp: String(formData.get("whatsapp") ?? "").trim() || undefined,
    p_address: String(formData.get("address") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/agencias");
  redirect("/agencias");
}

export async function createAgencyRendition(formData: FormData) {
  const { supabase, organizationId } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "");
  const { error } = await supabase.rpc("create_agency_rendition", {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_rendition_date: String(formData.get("rendition_date") ?? ""),
    p_period_start: String(formData.get("period_start") ?? ""),
    p_period_end: String(formData.get("period_end") ?? ""),
    p_amount_due: Number(formData.get("amount_due") ?? 0),
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/agencias");
  revalidatePath(`/agencias/${agentId}`);
  redirect(`/agencias/${agentId}`);
}

export async function receiveAgencyRendition(formData: FormData) {
  const { supabase, organizationId } = await getOrg();
  const renditionId = String(formData.get("rendition_id") ?? "");
  const agentId = String(formData.get("agent_id") ?? "");
  const { error } = await supabase.rpc("receive_agency_rendition", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_payment_date: String(formData.get("payment_date") ?? ""),
    p_amount: Number(formData.get("amount") ?? 0),
    p_cash_account_id: String(formData.get("cash_account_id") ?? ""),
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/agencias");
  revalidatePath(`/agencias/${agentId}`);
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  redirect(`/agencias/${agentId}`);
}