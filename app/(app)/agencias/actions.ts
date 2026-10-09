"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayInAgencyTimeZone } from "@/lib/agency-datetime";

async function getOrg() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  if (!claims?.sub) redirect("/login");

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", claims.sub)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError || !member) throw new Error("No hay una empresa configurada.");

  const manager = member.role === "owner" || member.role === "admin";
  const fullPermissions = {
    can_create_agents: true, can_delete_agents: true, can_create_renditions: true,
    can_edit_renditions: true, can_delete_renditions: true,
    can_register_payments: true, can_manage_backups: true,
  };
  const noPermissions = {
    can_create_agents: false, can_delete_agents: false, can_create_renditions: false,
    can_edit_renditions: false, can_delete_renditions: false,
    can_register_payments: false, can_manage_backups: false,
  };
  const { data: permissions } = manager
    ? { data: fullPermissions }
    : await supabase
        .from("organization_member_permissions")
        .select("can_create_agents,can_delete_agents,can_create_renditions,can_edit_renditions,can_delete_renditions,can_register_payments,can_manage_backups")
        .eq("organization_id", member.organization_id)
        .eq("user_id", claims.sub)
        .maybeSingle();

  return { supabase, organizationId: member.organization_id, role: member.role, permissions: permissions ?? noPermissions };
}

export async function createAgencyAgent(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const kindValue = String(formData.get("kind") ?? "subagent");
  const code = String(formData.get("code") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const kindLabel = kindValue === "ambulant" ? "ambulante" : "subagente";

  if (!permissions.can_create_agents) redirect("/agencias?error=sin-permiso-alta");
  if (!["subagent", "ambulant"].includes(kindValue)) redirect("/agencias?error=tipo-invalido");
  if (!/^\d{3}-\d{3}-\d{2}$/.test(code)) {
    redirect("/agencias?error=codigo-invalido&tipo=" + kindLabel + "&codigo=" + encodeURIComponent(code));
  }
  if (!fullName) redirect("/agencias?error=nombre-obligatorio&tipo=" + kindLabel + "&codigo=" + encodeURIComponent(code));
  const kind = kindValue as "subagent" | "ambulant";

  // Friendly pre-check; the unique database index is the concurrency-safe final guard.
  const { data: duplicate, error: duplicateError } = await supabase
    .from("agency_agents")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("kind", kind)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (duplicateError) redirect("/agencias?error=alta-fallida");
  if (duplicate) {
    redirect("/agencias?error=duplicado&tipo=" + kindLabel + "&codigo=" + encodeURIComponent(code));
  }

  const { error } = await supabase.rpc("create_agency_agent", {
    p_organization_id: organizationId,
    p_kind: kind,
    p_full_name: fullName,
    p_code: code,
    p_dni: String(formData.get("dni") ?? "").trim() || undefined,
    p_phone: String(formData.get("phone") ?? "").trim() || undefined,
    p_whatsapp: String(formData.get("whatsapp") ?? "").trim() || undefined,
    p_address: String(formData.get("address") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (error) {
    const normalized = error.message.toLowerCase();
    if (error.code === "23505" || normalized.includes("ya está cargado") || normalized.includes("duplicate key")) {
      redirect("/agencias?error=duplicado&tipo=" + kindLabel + "&codigo=" + encodeURIComponent(code));
    }
    if (normalized.includes("permiso")) redirect("/agencias?error=sin-permiso-alta");
    redirect("/agencias?error=alta-fallida");
  }
  revalidatePath("/agencias");
  redirect("/agencias?resultado=creado&codigo=" + encodeURIComponent(code));
}

export async function createAgencyRendition(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  if (!permissions.can_create_renditions) redirect("/pagos?error=sin-permiso-rendicion");
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const submittedDate = String(formData.get("rendition_date") ?? "").trim();
  const renditionDate = submittedDate || todayInAgencyTimeZone();
  const breakdown = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("game_"))
    .map(([key, value]) => ({ game_type_id: key.slice(5), amount: Number(value) }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
  const totalDue = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const ticketNumbers = String(formData.get("ticket_numbers") ?? "")
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const parsedRenditionDate = new Date(renditionDate + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renditionDate) || Number.isNaN(parsedRenditionDate.getTime()) || parsedRenditionDate.toISOString().slice(0, 10) !== renditionDate) {
    throw new Error("Ingresá una fecha de juego válida.");
  }
  if (!agentId) throw new Error("Seleccioná un subagente o ambulante.");
  if (breakdown.length === 0 || totalDue <= 0) throw new Error("Ingresá o reconocé al menos un importe por juego.");

  const qrPayload = String(formData.get("ticket_qr_payload") ?? "").trim() || null;
  const gamePeriod = String(formData.get("game_period") ?? "").trim() || null;
  const drawNumber = String(formData.get("draw_number") ?? "").trim() || null;
  const requestedCaptureMethod = String(formData.get("capture_method") ?? "manual");
  const captureMethod = ["manual", "photo", "qr"].includes(requestedCaptureMethod) ? requestedCaptureMethod : "manual";

  const { data: renditionId, error } = await supabase.rpc("create_agency_rendition_with_capture", {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_rendition_date: renditionDate,
    p_amount_due: totalDue,
    p_game_breakdown: breakdown,
    p_ticket_numbers: ticketNumbers,
    p_ticket_qr_payload: qrPayload,
    p_game_period: gamePeriod,
    p_draw_number: drawNumber,
    p_capture_method: captureMethod,
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (error) {
    if (error.message.toLowerCase().includes("permiso")) redirect("/pagos?error=sin-permiso-rendicion");
    redirect("/pagos?error=rendicion-fallida&agent=" + encodeURIComponent(agentId));
  }

  // Attempt immediate email delivery. The full text remains stored in the durable outbox
  // if mail credentials are not yet configured or the provider is temporarily unavailable.
  if (renditionId) {
    try {
      await supabase.functions.invoke("send-rendition-backup", {
        body: { rendition_id: renditionId },
      });
    } catch {
      // Do not undo an already-saved accounting transaction because email delivery failed.
    }
  }

  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/equipo");
  redirect("/pagos?agent=" + agentId + "&resultado=rendicion-creada");
}

export async function receiveAgencyRendition(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  if (!permissions.can_register_payments) redirect("/pagos?error=sin-permiso-cobro");
  const renditionId = String(formData.get("rendition_id") ?? "");
  const agentId = String(formData.get("agent_id") ?? "");
  const { data: cashAccount, error: cashLookupError } = await supabase
    .from("cash_accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("name", "Caja")
    .maybeSingle();
  if (cashLookupError) throw new Error(cashLookupError.message);

  let cajaId = cashAccount?.id ?? null;
  if (!cajaId) {
    const { data: fallbackCash, error: fallbackError } = await supabase
      .from("cash_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("name", "Caja principal")
      .maybeSingle();
    if (fallbackError) throw new Error(fallbackError.message);
    cajaId = fallbackCash?.id ?? null;
  }
  if (!cajaId) throw new Error("No hay una cuenta Caja configurada.");

  const { error } = await supabase.rpc("receive_agency_rendition", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_payment_date: String(formData.get("payment_date") ?? ""),
    p_amount: Number(formData.get("amount") ?? 0),
    p_cash_account_id: cajaId,
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (error) {
    if (error.message.toLowerCase().includes("permiso")) redirect("/pagos?error=sin-permiso-cobro");
    redirect("/pagos?error=cobro-fallido&agent=" + encodeURIComponent(agentId));
  }
  revalidatePath("/agencias");
  revalidatePath(`/agencias/${agentId}`);
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=cobro-registrado");
}

export async function deleteAgencyAgent(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  if (!permissions.can_delete_agents) redirect("/agencias?error=sin-permiso-baja");
  const agentId = String(formData.get("agent_id") ?? "").trim();
  if (!agentId || formData.get("confirm_delete") !== "yes") {
    throw new Error("Confirmá la eliminación del subagente o ambulante.");
  }

  const { data: agent, error: agentError } = await supabase
    .from("agency_agents")
    .select("id,code,full_name")
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (agentError) redirect("/agencias?error=baja-fallida");
  if (!agent) redirect("/agencias?error=agente-no-encontrado");

  const { data: existingRenditions, error: renditionError } = await supabase
    .from("agency_renditions")
    .select("id")
    .eq("agent_id", agentId)
    .eq("organization_id", organizationId)
    .limit(1);
  if (renditionError) redirect("/agencias?error=baja-fallida");

  if ((existingRenditions ?? []).length > 0) {
    const { error } = await supabase
      .from("agency_agents")
      .update({ is_active: false })
      .eq("id", agentId)
      .eq("organization_id", organizationId);
    if (error) redirect("/agencias?error=baja-fallida");
    revalidatePath("/agencias");
    revalidatePath("/pagos");
    redirect("/agencias?resultado=archivado&codigo=" + encodeURIComponent(agent.code ?? ""));
  }

  const { error } = await supabase
    .from("agency_agents")
    .delete()
    .eq("id", agentId)
    .eq("organization_id", organizationId);
  if (error) {
    if (error.code === "42501" || error.message.toLowerCase().includes("permission")) redirect("/agencias?error=sin-permiso-baja");
    redirect("/agencias?error=baja-fallida");
  }
  revalidatePath("/agencias");
  revalidatePath("/pagos");
  redirect("/agencias?resultado=eliminado&codigo=" + encodeURIComponent(agent.code ?? ""));
}


export async function updateAgencyRendition(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const renditionId = String(formData.get("rendition_id") ?? "").trim();
  if (!permissions.can_edit_renditions) redirect("/pagos?error=sin-permiso-editar");
  if (!agentId || !renditionId) redirect("/pagos?error=rendicion-invalida");

  const renditionDate = String(formData.get("rendition_date") ?? "").trim();
  const parsedDate = new Date(renditionDate + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renditionDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== renditionDate) {
    redirect("/pagos?error=fecha-invalida&agent=" + encodeURIComponent(agentId));
  }

  const breakdown = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("game_"))
    .map(([key, value]) => ({ game_type_id: key.slice(5), amount: Number(value) }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
  const amountDue = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const ticketNumbers = String(formData.get("ticket_numbers") ?? "")
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  if (!breakdown.length || amountDue <= 0) redirect("/pagos?error=importe-invalido&agent=" + encodeURIComponent(agentId));

  const qrPayload = String(formData.get("ticket_qr_payload") ?? "").trim() || null;
  const requestedMethod = String(formData.get("capture_method") ?? "manual");
  const captureMethod = ["manual", "photo", "qr"].includes(requestedMethod) ? requestedMethod : "manual";
  const { data: updatedId, error } = await supabase.rpc("update_agency_rendition_with_capture", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_rendition_date: renditionDate,
    p_amount_due: amountDue,
    p_game_breakdown: breakdown,
    p_ticket_numbers: ticketNumbers,
    p_ticket_qr_payload: qrPayload,
    p_game_period: String(formData.get("game_period") ?? "").trim() || null,
    p_draw_number: String(formData.get("draw_number") ?? "").trim() || null,
    p_capture_method: captureMethod,
    p_reference: String(formData.get("reference") ?? "").trim() || null,
    p_notes: String(formData.get("notes") ?? "").trim() || null,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("cobros registrados") || message.includes("con cobros")) {
      redirect("/pagos?error=rendicion-con-cobros&agent=" + encodeURIComponent(agentId));
    }
    if (message.includes("permiso")) redirect("/pagos?error=sin-permiso-editar&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=edicion-fallida&agent=" + encodeURIComponent(agentId));
  }

  if (updatedId) {
    try {
      await supabase.functions.invoke("send-rendition-backup", { body: { rendition_id: updatedId } });
    } catch {
      // Keep the revised text snapshot pending if mail transport is not ready.
    }
  }
  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/equipo");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=rendicion-corregida");
}

export async function voidAgencyRendition(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const renditionId = String(formData.get("rendition_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!permissions.can_delete_renditions) redirect("/pagos?error=sin-permiso-anular");
  if (!agentId || !renditionId || formData.get("confirm_void") !== "yes") {
    redirect("/pagos?error=anulacion-no-confirmada&agent=" + encodeURIComponent(agentId));
  }

  const { error } = await supabase.rpc("void_agency_rendition", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_reason: reason || null,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("cobros registrados")) redirect("/pagos?error=rendicion-con-cobros&agent=" + encodeURIComponent(agentId));
    if (message.includes("permiso")) redirect("/pagos?error=sin-permiso-anular&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=anulacion-fallida&agent=" + encodeURIComponent(agentId));
  }
  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=rendicion-anulada");
}
