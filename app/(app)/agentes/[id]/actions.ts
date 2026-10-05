"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/accounting";

export async function createAgencyRendition(formData:FormData) {
  const {supabase,organization}=await getCurrentContext(); if(!organization) redirect("/setup");
  const db=supabase as any; const agentId=String(formData.get("agent_id")??"");
  const {error}=await db.from("agency_renditions").insert({
    organization_id:organization.id, agent_id:agentId,
    rendition_date:String(formData.get("rendition_date")??""),
    period_start:String(formData.get("period_start")??"")||null,
    period_end:String(formData.get("period_end")??"")||null,
    amount_due:Number(formData.get("amount_due")??0),
    reference:String(formData.get("reference")??"").trim()||null,
    notes:String(formData.get("notes")??"").trim()||null
  });
  if(error) redirect("/agentes/"+agentId+"?error="+encodeURIComponent(error.message));
  revalidatePath("/agentes"); revalidatePath("/agentes/"+agentId); revalidatePath("/rendiciones"); revalidatePath("/dashboard");
  redirect("/agentes/"+agentId);
}

export async function receiveAgencyRendition(formData:FormData) {
  const {supabase,organization}=await getCurrentContext(); if(!organization) redirect("/setup");
  const db=supabase as any; const renditionId=String(formData.get("rendition_id")??"");
  const {data:rendition}=await db.from("agency_renditions").select("agent_id").eq("id",renditionId).eq("organization_id",organization.id).maybeSingle();
  if(!rendition) redirect("/rendiciones");
  const {error}=await db.rpc("receive_agency_rendition",{
    p_organization_id:organization.id,p_rendition_id:renditionId,
    p_payment_date:String(formData.get("payment_date")??""),
    p_amount:Number(formData.get("amount")??0),
    p_cash_account_id:String(formData.get("cash_account_id")??""),
    p_reference:String(formData.get("reference")??"").trim()||null,
    p_notes:String(formData.get("notes")??"").trim()||null
  });
  if(error) redirect("/agentes/"+rendition.agent_id+"?error="+encodeURIComponent(error.message));
  revalidatePath("/agentes"); revalidatePath("/agentes/"+rendition.agent_id); revalidatePath("/rendiciones"); revalidatePath("/movimientos"); revalidatePath("/dashboard");
  redirect("/agentes/"+rendition.agent_id);
}


export async function recordAgencyRenditionAndReceive(formData: FormData) {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) redirect("/setup");

  const db = supabase as any;
  const agentId = String(formData.get("agent_id") ?? "");
  const amountDue = Number(formData.get("amount_due") ?? 0);
  const amountReceived = Number(formData.get("amount_received") ?? 0);
  const cashAccountId = String(formData.get("cash_account_id") ?? "") || null;

  const { data, error } = await db.rpc("record_agency_rendition", {
    p_organization_id: organization.id,
    p_agent_id: agentId,
    p_rendition_date: String(formData.get("rendition_date") ?? ""),
    p_period_start: String(formData.get("period_start") ?? "") || null,
    p_period_end: String(formData.get("period_end") ?? "") || null,
    p_amount_due: amountDue,
    p_amount_received: amountReceived,
    p_cash_account_id: cashAccountId,
    p_reference: String(formData.get("reference") ?? "").trim() || null,
    p_notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) redirect("/agentes/" + agentId + "?error=" + encodeURIComponent(error.message));
  if (!data) redirect("/agentes/" + agentId + "?error=" + encodeURIComponent("No se pudo registrar la rendición."));

  revalidatePath("/agentes");
  revalidatePath("/agentes/" + agentId);
  revalidatePath("/rendiciones");
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  redirect("/agentes/" + agentId);
}
