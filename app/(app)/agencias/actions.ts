"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayInAgencyTimeZone } from "@/lib/agency-datetime";

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
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const submittedDate = String(formData.get("rendition_date") ?? "").trim();
  const renditionDate = submittedDate || todayInAgencyTimeZone();
  const breakdown = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("game_"))
    .map(([key, value]) => ({ game_type_id: key.slice(5), amount: Number(value) }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
  const totalDue = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const ticketNumbers = String(formData.get("ticket_numbers") ?? "")
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const parsedRenditionDate = new Date(renditionDate + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renditionDate) || Number.isNaN(parsedRenditionDate.getTime()) || parsedRenditionDate.toISOString().slice(0, 10) !== renditionDate) {
    throw new Error("Ingresá una fecha de juego válida.");
  }
  if (!agentId) throw new Error("Seleccioná un subagente o ambulante.");
  if (breakdown.length === 0 || totalDue <= 0) throw new Error("Ingresá o reconocé al menos un importe por juego.");

  const qrPayload = String(formData.get("ticket_qr_payload") ?? "").trim() || null;
  const gamePeriod = String(formData.get("game_period") ?? "").trim() || null;
  const drawNumber = String(formData.get("draw_number") ?? "").trim() || null;
  const requestedCaptureMethod = String(formData.get("capture_method") ?? "manual");
  const captureMethod = ["manual", "photo", "qr"].includes(requestedCaptureMethod) ? requestedCaptureMethod : "manual";

  const { error } = await supabase.rpc("create_agency_rendition_with_capture", {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_rendition_date: renditionDate,
    p_amount_due: totalDue,
    p_game_breakdown: breakdown,
    p_ticket_numbers: ticketNumbers,
    p_ticket_qr_payload: qrPayload,
    p_game_period: gamePeriod,
    p_draw_number: drawNumber,
    p_capture_method: captureMethod,
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  redirect("/pagos?agent=" + agentId);
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

export async function deleteAgencyAgent(formData: FormData) {
  const { supabase, organizationId } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  if (!agentId || formData.get("confirm_delete") !== "yes") {
    throw new Error("Confirmá la eliminación del subagente o ambulante.");
  }

  const { data: agent, error: agentError } = await supabase
    .from("agency_agents")
    .select("id,code,full_name")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (agentError) throw new Error(agentError.message);
  if (!agent) throw new Error("No se encontró ese subagente o ambulante.");

  const { data: existingRenditions, error: renditionError } = await supabase
    .from("agency_renditions")
    .select("id")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .limit(1);
  if (renditionError) throw new Error(renditionError.message);

  if ((existingRenditions ?? []).length > 0) {
    const { error } = await supabase
      .from("agency_agents")
      .update({ is_active: false })
      .eq("id", agentId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
    revalidatePath("/agencias");
    revalidatePath("/pagos");
    redirect("/agencias?resultado=archivado&codigo=" + encodeURIComponent(agent.code ?? ""));
  }

  const { error } = await supabase
    .from("agency_agents")
    .delete()
    .eq("id", agentId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  revalidatePath("/agencias");
  revalidatePath("/pagos");
  redirect("/agencias?resultado=eliminado&codigo=" + encodeURIComponent(agent.code ?? ""));
}
