"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOfficialAgencyGame } from "@/lib/agency-official-games";

async function getOrg() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) throw new Error("Sesión no válida.");

  const { data: member, error } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!member) throw new Error("No hay una empresa configurada.");
  return { supabase, organizationId: member.organization_id, role: member.role, userId: String(claims.sub) };
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function createGameType(formData: FormData) {
  const { supabase, organizationId, role } = await getOrg();
  if (role !== "owner") redirect("/juegos?error=solo-administrador");
  const name = clean(formData.get("name"));
  const officialGame = getOfficialAgencyGame(name);
  if (!officialGame) redirect("/juegos?error=juego-no-oficial");

  const { data: existing, error: existingError } = await supabase
    .from("agency_game_types").select("id")
    .eq("organization_id", organizationId).eq("name", officialGame.name).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) redirect("/juegos?error=juego-existente");

  const { error } = await supabase.from("agency_game_types").insert({
    organization_id: organizationId,
    name: officialGame.name,
    category: officialGame.category,
    sort_order: officialGame.sortOrder,
    enabled: true,
  });
  if (error) throw new Error(error.code === "23505" ? "Ese juego oficial ya existe." : error.message);

  revalidatePath("/juegos");
  revalidatePath("/dashboard");
  revalidatePath("/agencias");
}

export async function updateGameType(formData: FormData) {
  const { supabase, organizationId, role } = await getOrg();
  if (role !== "owner") redirect("/juegos?error=solo-administrador");
  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  const officialGame = getOfficialAgencyGame(name);
  const enabled = formData.get("enabled") === "on";

  if (!id || !officialGame) redirect("/juegos?error=juego-no-oficial");

  const { error } = await supabase
    .from("agency_game_types")
    .update({ name: officialGame.name, category: officialGame.category, enabled, sort_order: officialGame.sortOrder, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) throw new Error(error.code === "23505" ? "Ya existe otro juego con ese nombre." : error.message);

  revalidatePath("/juegos");
  revalidatePath("/dashboard");
  revalidatePath("/agencias");
}

export async function deleteGameType(formData: FormData) {
  const { supabase, organizationId, role } = await getOrg();
  if (role !== "owner") redirect("/juegos?error=solo-administrador");
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


export async function saveDefaultGameCommissions(formData: FormData) {
  const { supabase, organizationId, role, userId } = await getOrg();
  if (role !== "owner") redirect("/juegos?error=solo-administrador");

  const submitted = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("default_commission_"))
    .map(([key, value]) => ({
      organization_id: organizationId,
      game_type_id: key.slice("default_commission_".length),
      commission_percent: Number(String(value ?? "").trim()),
      created_by: userId,
      updated_at: new Date().toISOString(),
    }));

  if (!submitted.length || submitted.some((row) => !Number.isFinite(row.commission_percent) || row.commission_percent < 0 || row.commission_percent > 100)) {
    redirect("/juegos?error=comisiones-generales-invalidas");
  }

  const { data: games, error: gamesError } = await supabase.from("agency_game_types").select("id,name").eq("organization_id", organizationId);
  if (gamesError) redirect("/juegos?error=comisiones-generales-no-guardadas");
  const allowed = new Set((games ?? []).filter((game) => Boolean(getOfficialAgencyGame(game.name))).map((game) => game.id));
  if (submitted.some((row) => !allowed.has(row.game_type_id))) redirect("/juegos?error=comisiones-generales-invalidas");

  const { error } = await supabase.from("agency_game_commission_defaults").upsert(submitted, { onConflict: "organization_id,game_type_id" });
  if (error) redirect("/juegos?error=comisiones-generales-no-guardadas");

  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    user_id: userId,
    action: "update_general_game_commissions",
    entity: "agency_game_commission_defaults",
    entity_id: organizationId,
    payload: { game_count: submitted.length },
  });

  revalidatePath("/juegos");
  revalidatePath("/agencias");
  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  redirect("/juegos?resultado=comisiones-generales-guardadas");
}
