"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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


export async function removeOrganizationMember(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");
  const password = String(formData.get("password") ?? "");
  const targetUserId = String(formData.get("user_id") ?? "");
  if (!password || !targetUserId) redirect("/configuracion/usuarios?error=datos-invalidos");
  const email = typeof claims.email === "string" ? claims.email : "";
  if (!email) redirect("/configuracion/usuarios?error=verificacion-fallida");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Faltan las variables de Supabase.");
  const verifier = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: authError } = await verifier.auth.signInWithPassword({ email, password });
  if (authError) redirect("/configuracion/usuarios?error=contrasena-incorrecta");
  const { data: member } = await supabase.from("organization_members").select("organization_id,role").eq("user_id", claims.sub).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!member || member.role !== "owner") redirect("/configuracion/usuarios?error=solo-titular");
  const { error } = await supabase.rpc("remove_organization_member", { p_organization_id: member.organization_id, p_user_id: targetUserId });
  if (error) {
    const code = error.code === "42501" ? "sin-permiso-eliminar" : "eliminacion-fallida";
    redirect("/configuracion/usuarios?error=" + code);
  }
  revalidatePath("/configuracion/usuarios");
  revalidatePath("/dashboard");
  if (targetUserId === claims.sub) redirect("/login?mensaje=acceso-desvinculado");
  redirect("/configuracion/usuarios?resultado=usuario-eliminado");
}
