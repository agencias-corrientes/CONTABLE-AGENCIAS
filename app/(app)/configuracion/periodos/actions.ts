"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function parseFiscalDate(rawValue: string): string | null {
  const value = rawValue.trim();
  let iso = value;
  const local = value.match(/^([0-9]{2})\/([0-9]{2})\/([0-9]{4})$/);
  if (local) iso = local[3] + "-" + local[2] + "-" + local[1];
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso)) return null;
  const date = new Date(iso + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

export async function createPeriod(formData: FormData) {
  const supabase=await createClient();
  const {data:authData}=await supabase.auth.getClaims();
  const claims=authData?.claims;
  if(!claims?.sub) redirect("/login");
  const {data:member}=await supabase.from("organization_members").select("organization_id").eq("user_id",claims.sub).order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(!member) throw new Error("No hay una empresa configurada.");
  const startDate=parseFiscalDate(String(formData.get("start_date")??""));
  const endDate=parseFiscalDate(String(formData.get("end_date")??""));
  if(!startDate||!endDate||startDate>endDate) redirect("/configuracion/periodos?error=fecha-invalida");
  const {error}=await supabase.rpc("create_fiscal_period",{
    p_organization_id:member.organization_id,
    p_name:String(formData.get("name")??"").trim(),
    p_start_date:startDate,
    p_end_date:endDate,
  });
  if(error) throw new Error(error.message);
  revalidatePath("/configuracion/periodos");
  redirect("/configuracion/periodos");
}
