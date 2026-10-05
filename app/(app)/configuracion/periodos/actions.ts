"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPeriod(formData: FormData) {
  const supabase=await createClient();
  const {data:authData}=await supabase.auth.getClaims();
  const claims=authData?.claims;
  if(!claims?.sub) redirect("/login");
  const {data:member}=await supabase.from("organization_members").select("organization_id").eq("user_id",claims.sub).order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(!member) throw new Error("No hay una empresa configurada.");
  const {error}=await supabase.rpc("create_fiscal_period",{
    p_organization_id:member.organization_id,
    p_name:String(formData.get("name")??"").trim(),
    p_start_date:String(formData.get("start_date")??""),
    p_end_date:String(formData.get("end_date")??""),
  });
  if(error) throw new Error(error.message);
  revalidatePath("/configuracion/periodos");
  redirect("/configuracion/periodos");
}
