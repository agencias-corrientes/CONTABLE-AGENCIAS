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
  const renditionDate = String(formData.get("rendition_date") ?? "").trim();
  const breakdown = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("game_"))
    .map(([key, value]) => ({ game_type_id: key.slice(5), amount: Number(value) }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
  const totalDue = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const ticketNumbers = String(formData.get("ticket_numbers") ?? "")
    .split(/[\\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  if (!renditionDate) throw new Error("La fecha de rendición es obligatoria.");
  if (breakdown.length === 0 || totalDue <= 0) throw new Error("Ingresá al menos un importe por juego.");

  const { error } = await supabase.rpc("create_agency_rendition", {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_rendition_date: renditionDate,
    p_period_start: renditionDate,
    p_period_end: renditionDate,
    p_amount_due: totalDue,
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
    p_game_breakdown: breakdown,
    p_ticket_numbers: ticketNumbers,
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
  const { data: cashAccount, error: cashLookupError } = await supabase
    .from("cash_accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("name", "Caja")
    .maybeSingle();
  if (cashLookupError) throw new Error(cashLookupError.message);

  let cajaId = cashAccount?.id ?? null;
  if (!cajaId) {
    const { data: fallbackCash, error: fallbackError } = await supabase
      .from("cash_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("name", "Caja principal")
      .maybeSingle();
    if (fallbackError) throw new Error(fallbackError.message);
    cajaId = fallbackCash?.id ?? null;
  }
  if (!cajaId) throw new Error("No hay una cuenta Caja configurada.");

  const { error } = await supabase.rpc("receive_agency_rendition", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_payment_date: String(formData.get("payment_date") ?? ""),
    p_amount: Number(formData.get("amount") ?? 0),
    p_cash_account_id: cajaId,
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