"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function setMemberRole(formData: FormData){
  const supabase=await createClient();
  const {data:authData}=await supabase.auth.getClaims();
  const claims=authData?.claims;
  if(!claims?.sub) redirect("/login");
  const {data:member}=await supabase.from("organization_members").select("organization_id").eq("user_id",claims.sub).order("created_at",{ascending:true}).limit(1).maybeSingle();
  if(!member) throw new Error("No hay una empresa configurada.");
  const role=String(formData.get("role")??"viewer") as "owner"|"admin"|"accountant"|"viewer";
  const userId=String(formData.get("user_id")??"");
  const {error}=await supabase.rpc("set_member_role",{p_organization_id:member.organization_id,p_user_id:userId,p_role:role});
  if(error) throw new Error(error.message);
  revalidatePath("/configuracion/usuarios");
  redirect("/configuracion/usuarios");
}
