"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentContext } from "@/lib/accounting";

export async function createAgencyAgent(formData: FormData) {
  const { supabase, organization } = await getCurrentContext();
  if (!organization) redirect("/setup");
  const db = supabase as any;
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) redirect("/agentes?error=Ingresá%20un%20nombre");

  const { error } = await db.from("agency_agents").insert({
    organization_id: organization.id,
    code: String(formData.get("code") ?? "").trim() || null,
    kind: String(formData.get("kind") ?? "subagent"),
    full_name: fullName,
    phone: String(formData.get("phone") ?? "").trim() || null,
    whatsapp: String(formData.get("whatsapp") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) redirect("/agentes?error=" + encodeURIComponent(error.message));
  revalidatePath("/agentes");
  revalidatePath("/dashboard");
  redirect("/agentes");
}
