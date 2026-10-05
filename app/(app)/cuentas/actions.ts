"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createAccount(formData: FormData) {
  const supabase = await createClient();
  const { data: { claims } } = await supabase.auth.getClaims();

  if (!claims?.sub) throw new Error("Sesión no válida.");

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member) throw new Error("No hay una empresa configurada.");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "expense");

  if (!code || !name) throw new Error("Código y nombre son obligatorios.");

  const { error } = await supabase.from("accounts").insert({
    organization_id: member.organization_id,
    code,
    name,
    type,
    allow_posting: true,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/cuentas");
  revalidatePath("/dashboard");
}
