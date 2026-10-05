"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createContact(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) throw new Error("Sesión no válida.");

  const { data: member } = await supabase.from("organization_members").select("organization_id").eq("user_id", claims.sub).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!member) throw new Error("No hay una empresa configurada.");

  const { error } = await supabase.from("contacts").insert({
    organization_id: member.organization_id,
    type: String(formData.get("type") ?? "other") as "customer" | "vendor" | "employee" | "other",
    display_name: String(formData.get("display_name") ?? "").trim(),
    tax_id: String(formData.get("tax_id") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/contactos");
  revalidatePath("/dashboard");
}
