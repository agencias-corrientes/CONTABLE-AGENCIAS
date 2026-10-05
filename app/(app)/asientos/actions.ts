"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function numberField(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  return raw === "" ? 0 : Number(raw);
}

export async function createDraftJournal(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");

  const account1 = String(formData.get("account_1") ?? "");
  const account2 = String(formData.get("account_2") ?? "");
  const debit1 = numberField(formData, "debit_1");
  const credit1 = numberField(formData, "credit_1");
  const debit2 = numberField(formData, "debit_2");
  const credit2 = numberField(formData, "credit_2");

  const lines = [
    { account_id: account1, debit: debit1, credit: credit1 },
    { account_id: account2, debit: debit2, credit: credit2 },
  ];

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member) throw new Error("No hay una empresa configurada.");

  const { data, error } = await supabase.rpc("create_draft_journal_entry", {
    p_organization_id: member.organization_id,
    p_entry_date: String(formData.get("entry_date") ?? ""),
    p_description: String(formData.get("description") ?? "").trim(),
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_lines: lines,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se pudo crear el asiento.");

  revalidatePath("/asientos");
  revalidatePath("/reportes/diario");
  redirect("/asientos");
}

export async function postJournal(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");

  const entryId = String(formData.get("entry_id") ?? "");
  if (!entryId) throw new Error("Asiento inválido.");

  const { error } = await supabase.rpc("post_journal_entry", { p_entry_id: entryId });
  if (error) throw new Error(error.message);

  revalidatePath("/asientos");
  revalidatePath("/reportes/diario");
  revalidatePath("/reportes/balance");
  revalidatePath("/reportes/resultados");
  revalidatePath("/reportes/patrimonial");
  revalidatePath("/dashboard");
  redirect("/asientos");
}
