"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function setMemberRole(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");

  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("role") ?? "viewer");
  if (!targetUserId || !["owner", "admin", "accountant", "viewer"].includes(role)) {
    redirect("/configuracion/usuarios?error=datos-rol-invalidos");
  }
  if (targetUserId === claims.sub) {
    redirect("/configuracion/usuarios?error=no-cambiar-rol-propio");
  }

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError || !member) redirect("/configuracion/usuarios?error=rol-no-guardado");
  if (member.role !== "owner") redirect("/configuracion/usuarios?error=solo-titular");

  const { error } = await supabase.rpc("set_member_role", {
    p_organization_id: member.organization_id,
    p_user_id: targetUserId,
    p_role: role,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("permission denied for schema private")) {
      redirect("/configuracion/usuarios?error=permisos-supabase-pendientes");
    }
    if (message.includes("only an owner") || message.includes("insufficient permissions") || error.code === "42501") {
      redirect("/configuracion/usuarios?error=solo-titular");
    }
    if (message.includes("organization must keep at least one owner")) {
      redirect("/configuracion/usuarios?error=debe-quedar-un-titular");
    }
    if (message.includes("member not found")) {
      redirect("/configuracion/usuarios?error=usuario-no-encontrado");
    }
    redirect("/configuracion/usuarios?error=rol-no-guardado");
  }

  revalidatePath("/configuracion/usuarios");
  revalidatePath("/equipo");
  redirect("/configuracion/usuarios?resultado=rol-guardado");
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
    const message = error.message.toLowerCase();
    if (message.includes("could not find the function") || message.includes("function public.remove_organization_member") || error.code === "42883" || error.code === "PGRST202") {
      redirect("/configuracion/usuarios?error=funcion-remocion-pendiente");
    }
    if (error.code === "42501" && message.includes("único titular")) {
      redirect("/configuracion/usuarios?error=debe-quedar-un-titular");
    }
    const code = error.code === "42501" ? "sin-permiso-eliminar" : "eliminacion-fallida";
    redirect("/configuracion/usuarios?error=" + code);
  }
  revalidatePath("/configuracion/usuarios");
  revalidatePath("/dashboard");
  if (targetUserId === claims.sub) redirect("/login?mensaje=acceso-desvinculado");
  redirect("/configuracion/usuarios?resultado=usuario-eliminado");
}
