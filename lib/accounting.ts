import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentContext() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.sub) redirect("/login");

  const userId = String(claims.sub);
  const userEmail = typeof claims.email === "string" ? claims.email : "Usuario";

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError) throw new Error(memberError.message);

  if (!member) {
    return { supabase, userId, userEmail, member: null, organization: null };
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name, legal_name, tax_id, currency_code, timezone")
    .eq("id", member.organization_id)
    .single();

  if (organizationError) throw new Error(organizationError.message);

  return { supabase, userId, userEmail, member, organization };
}

export function money(value: number | string | null | undefined, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}
