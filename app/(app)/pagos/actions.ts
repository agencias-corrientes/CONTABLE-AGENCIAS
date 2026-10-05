"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPayment(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: member } = await supabase.from("organization_members")
    .select("organization_id").eq("user_id", claims.sub).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!member) throw new Error("No hay una empresa configurada.");

  const { error } = await supabase.rpc("create_payment", {
    p_organization_id: member.organization_id,
    p_contact_id: String(formData.get("contact_id")??"") || undefined,
    p_cash_account_id: String(formData.get("cash_account_id")??"") || undefined,
    p_sales_invoice_id: String(formData.get("sales_invoice_id")??"") || undefined,
    p_purchase_bill_id: String(formData.get("purchase_bill_id")??"") || undefined,
    p_direction: String(formData.get("direction")??"incoming") as "incoming" | "outgoing",
    p_payment_date: String(formData.get("payment_date")??""),
    p_amount: Number(formData.get("amount")??0),
    p_reference: String(formData.get("reference")??"").trim() || undefined,
    p_notes: String(formData.get("notes")??"").trim() || undefined,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/pagos");
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  redirect("/pagos");
}
