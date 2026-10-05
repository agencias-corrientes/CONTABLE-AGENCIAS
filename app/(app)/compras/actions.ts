"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function membership(){
  const supabase=await createClient();
  const {data:authData}=await supabase.auth.getClaims();
  const claims=authData?.claims;
  if(!claims?.sub) redirect("/login");
  const {data:member}=await supabase.from("organization_members").select("organization_id").eq("user_id",claims.sub).order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(!member) throw new Error("No hay una empresa configurada.");
  return {supabase,organizationId:member.organization_id};
}

export async function createPurchaseBill(formData:FormData){
  const {supabase,organizationId}=await membership();
  const quantity=Number(formData.get("quantity")??0),unitPrice=Number(formData.get("unit_price")??0),taxRate=Number(formData.get("tax_rate")??0);
  const subtotal=Math.round(quantity*unitPrice*100)/100,taxAmount=Math.round(subtotal*taxRate/100*100)/100;
  const {error}=await supabase.rpc("create_purchase_bill",{p_organization_id:organizationId,p_contact_id:(String(formData.get("contact_id")??"")||null) as unknown as string,p_bill_number:String(formData.get("bill_number")??"").trim(),p_issue_date:String(formData.get("issue_date")??""),p_due_date:String(formData.get("due_date")??"")||undefined,p_subtotal:subtotal,p_tax_amount:taxAmount,p_notes:String(formData.get("notes")??"").trim()||undefined,p_item_description:String(formData.get("item_description")??"").trim()||undefined,p_quantity:quantity,p_unit_price:unitPrice,p_tax_rate:taxRate});
  if(error) throw new Error(error.message);
  revalidatePath("/compras");revalidatePath("/dashboard");redirect("/compras");
}

export async function issuePurchaseBill(formData:FormData){
  const {supabase}=await membership();
  const {error}=await supabase.rpc("issue_purchase_bill",{p_bill_id:String(formData.get("bill_id")??"")});
  if(error) throw new Error(error.message);
  revalidatePath("/compras");revalidatePath("/pagos");redirect("/compras");
}
