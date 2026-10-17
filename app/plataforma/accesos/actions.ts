"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const allowedStatuses = new Set(["approved", "rejected", "suspended", "revoked"]);

export async function reviewPlatformAccessRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims?.sub) redirect("/login");

  const userId = String(formData.get("user_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const note = String(formData.get("review_note") ?? "").trim().slice(0, 500);
  if (!userId || !allowedStatuses.has(status)) {
    redirect("/plataforma/accesos?error=datos");
  }

  const { error } = await (supabase as any).rpc("review_platform_access_request", {
    p_user_id: userId,
    p_status: status,
    p_note: note || null,
  });
  if (error) {
    revalidatePath("/plataforma/accesos");
    redirect("/plataforma/accesos?error=revision");
  }

  revalidatePath("/plataforma/accesos");
  revalidatePath("/acceso-pendiente");
  revalidatePath("/acceso-bloqueado");
  redirect("/plataforma/accesos?actualizado=1");
}
