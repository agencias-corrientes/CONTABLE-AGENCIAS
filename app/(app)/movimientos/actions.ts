"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createCashMovement(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member) throw new Error("No hay una empresa configurada.");

  const { error } = await supabase.rpc("create_cash_movement", {
    p_organization_id: member.organization_id,
    p_cash_account_id: String(formData.get("cash_account_id") ?? ""),
    p_movement_date: String(formData.get("movement_date") ?? ""),
    p_direction: String(formData.get("direction") ?? "incoming") as "incoming" | "outgoing",
    p_amount: Number(formData.get("amount") ?? 0),
    p_description: String(formData.get("description") ?? "").trim(),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  redirect("/movimientos");
}
