"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function getOrg() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) throw new Error("Sesión no válida.");

  const { data: member, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!member) throw new Error("No hay una empresa configurada.");
  return { supabase, organizationId: member.organization_id };
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function createGameType(formData: FormData) {
  const { supabase, organizationId } = await getOrg();
  const name = clean(formData.get("name"));
  const category = clean(formData.get("category")) || "Quiniela";
  if (!name) throw new Error("El nombre del juego es obligatorio.");

  const maxOrder = await supabase
    .from("agency_game_types")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = Number(maxOrder.data?.sort_order ?? 0) + 10;
  const { error } = await supabase.from("agency_game_types").insert({
    organization_id: organizationId,
    name,
    category,
    sort_order: nextOrder,
    enabled: true,
  });
  if (error) throw new Error(error.code === "23505" ? "Ya existe ese juego." : error.message);

  revalidatePath("/juegos");
  revalidatePath("/dashboard");
  revalidatePath("/agencias");
}

export async function updateGameType(formData: FormData) {
  const { supabase, organizationId } = await getOrg();
  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  const category = clean(formData.get("category")) || "Quiniela";
  const enabled = formData.get("enabled") === "on";

  if (!id || !name) throw new Error("Nombre e identificador son obligatorios.");

  const { error } = await supabase
    .from("agency_game_types")
    .update({ name, category, enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.code === "23505" ? "Ya existe otro juego con ese nombre." : error.message);

  revalidatePath("/juegos");
  revalidatePath("/dashboard");
  revalidatePath("/agencias");
}

export async function deleteGameType(formData: FormData) {
  const { supabase, organizationId } = await getOrg();
  const id = clean(formData.get("id"));
  if (!id) throw new Error("Juego inválido.");

  const { count, error: countError } = await supabase
    .from("agency_rendition_game_amounts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("game_type_id", id);

  if (countError) throw new Error(countError.message);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("agency_game_types")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("agency_game_types")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/juegos");
  revalidatePath("/dashboard");
  revalidatePath("/agencias");
}
