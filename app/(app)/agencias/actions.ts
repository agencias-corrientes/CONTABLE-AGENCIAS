"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayInAgencyTimeZone } from "@/lib/agency-datetime";
import { drawPeriodHasPassed, getOfficialDrawPeriodsForDate } from "@/lib/agency-draw-schedule";

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

  const manager = member.role === "owner";
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

  return { supabase, organizationId: member.organization_id, role: member.role, userId: String(claims.sub), permissions: permissions ?? noPermissions };
}


async function storeRenditionTicketPhoto(supabase: any, organizationId: string, renditionId: string, formData: FormData): Promise<"saved" | "skipped" | "failed"> {
  const value = formData.get("ticket_photo");
  if (!(value instanceof File) || value.size === 0) return "skipped";
  const { data: settings } = await supabase.from("organization_backup_settings").select("include_ticket_photo").eq("organization_id", organizationId).maybeSingle();
  if (settings?.include_ticket_photo === false) return "skipped";
  if (value.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(value.type)) return "failed";
  const extension = value.type === "image/png" ? "png" : value.type === "image/webp" ? "webp" : "jpg";
  const photoPath = organizationId + "/" + renditionId + "/" + Date.now() + "." + extension;
  const { error: uploadError } = await supabase.storage.from("agency-rendition-tickets").upload(photoPath, value, { contentType: value.type, upsert: false, cacheControl: "3600" });
  if (uploadError) return "failed";
  const { error: attachError } = await supabase.rpc("attach_agency_rendition_backup_photo", {
    p_organization_id: organizationId, p_rendition_id: renditionId, p_photo_path: photoPath,
  });
  return attachError ? "failed" : "saved";
}

async function sendRenditionBackup(_supabase: any, _renditionId: string): Promise<"cierre-diario"> {
  // The audit trigger has already stored this revision in the outbox.
  // All queued revisions are sent together by the scheduled end-of-day job.
  return "cierre-diario";
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
  if (!agentId) redirect("/pagos?error=agente-no-encontrado");
  const { data: agentPolicyRow, error: policyLookupError } = await supabase.from("agency_agents")
    .select("rendition_policy,rendition_periods").eq("id", agentId).eq("organization_id", organizationId).maybeSingle();
  if (policyLookupError || !agentPolicyRow) redirect("/pagos?error=agente-no-encontrado");
  const renditionPolicy = String(agentPolicyRow.rendition_policy ?? "per_draw");
  const selectedRenditionPeriods = Array.isArray(agentPolicyRow.rendition_periods) ? agentPolicyRow.rendition_periods.map(String) : [];
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
  const operationalDate = String(formData.get("operational_date") ?? "").trim();
  const dailyStatus = String(formData.get("draw_status") ?? "").trim();
  const drawPeriod = String(formData.get("draw_period") ?? "").trim();
  const dailyStatusNotes = String(formData.get("daily_status_notes") ?? "").trim();
  const reportedAmountRaw = String(formData.get("reported_amount") ?? "").trim();
  const reportedAmount = dailyStatus === "complete" ? totalDue : Number(reportedAmountRaw.replace(",", "."));
  const parsedRenditionDate = new Date(renditionDate + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renditionDate) || Number.isNaN(parsedRenditionDate.getTime()) || parsedRenditionDate.toISOString().slice(0, 10) !== renditionDate) {
    throw new Error("Ingresá una fecha de juego válida.");
  }
  if (!agentId) throw new Error("Seleccioná un subagente o ambulante.");
  if (breakdown.length === 0 || totalDue <= 0) throw new Error("Ingresá o reconocé al menos un importe por juego.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(operationalDate) ||
    !["complete", "incomplete"].includes(dailyStatus) || !drawPeriod
  ) {
    redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
  }
  if (renditionDate !== operationalDate) redirect("/pagos?error=fecha-sorteo-invalida&agent=" + encodeURIComponent(agentId));
  if ((renditionPolicy === "daily" && drawPeriod !== "Cierre diario") ||
      (renditionPolicy !== "daily" && drawPeriod === "Cierre diario") ||
      (renditionPolicy === "selected_draws" && !selectedRenditionPeriods.includes(drawPeriod))) {
    redirect("/pagos?error=modalidad-sorteo-invalido&agent=" + encodeURIComponent(agentId));
  }
  if (renditionPolicy === "daily") {
    const lastScheduledDraw = getOfficialDrawPeriodsForDate(operationalDate)
      .filter((period) => Boolean(period.time))
      .sort((left, right) => String(left.time).localeCompare(String(right.time)))
      .at(-1);
    if (!lastScheduledDraw || !drawPeriodHasPassed(lastScheduledDraw, operationalDate)) {
      redirect("/pagos?error=cierre-diario-antes-de-hora&agent=" + encodeURIComponent(agentId));
    }
  }
  if (dailyStatus === "incomplete" && (
    !reportedAmountRaw ||
    !Number.isFinite(reportedAmount) ||
    reportedAmount <= 0 ||
    reportedAmount > totalDue ||
    reportedAmount > 999999999999.99
  )) {
    redirect("/pagos?error=monto-rendido-invalido&agent=" + encodeURIComponent(agentId));
  }

  const qrPayload = String(formData.get("ticket_qr_payload") ?? "").trim() || null;
  const drawNumber = String(formData.get("draw_number") ?? "").trim() || null;
  const requestedCaptureMethod = String(formData.get("capture_method") ?? "manual");
  const captureMethod = ["manual", "photo", "qr"].includes(requestedCaptureMethod) ? requestedCaptureMethod : "manual";


  if (!permissions.can_register_payments) {
    redirect("/pagos?error=sin-permiso-cobro&agent=" + encodeURIComponent(agentId));
  }
  const { data: cashAccount, error: cashLookupError } = await supabase
    .from("cash_accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("name", "Caja")
    .maybeSingle();
  if (cashLookupError || !cashAccount?.id) {
    redirect("/pagos?error=caja-no-configurada&agent=" + encodeURIComponent(agentId));
  }
  let renditionId: string | null = null;
  let error: any = null;
  if (renditionPolicy === "daily") {
    const result = await supabase.rpc("create_agency_rendition_with_capture_and_daily_status", {
      p_organization_id: organizationId, p_agent_id: agentId, p_rendition_date: renditionDate,
      p_amount_due: totalDue, p_operational_date: operationalDate, p_daily_status: dailyStatus,
      p_game_breakdown: breakdown, p_ticket_numbers: ticketNumbers, p_ticket_qr_payload: qrPayload ?? undefined,
      p_game_period: drawPeriod, p_draw_number: drawNumber ?? undefined, p_capture_method: captureMethod,
      p_reference: String(formData.get("reference") ?? "").trim() || undefined,
      p_notes: String(formData.get("notes") ?? "").trim() || undefined,
      p_daily_status_notes: dailyStatus === "incomplete" ? (dailyStatusNotes || undefined) : undefined,
      p_reported_amount: dailyStatus === "incomplete" ? reportedAmount : null,
    });
    renditionId = result.data; error = result.error;
  } else {
    const result = await supabase.rpc("create_agency_rendition_with_capture_and_draw_status", {
      p_organization_id: organizationId, p_agent_id: agentId, p_rendition_date: renditionDate,
      p_amount_due: totalDue, p_operational_date: operationalDate, p_draw_period: drawPeriod,
      p_draw_status: dailyStatus, p_game_breakdown: breakdown, p_ticket_numbers: ticketNumbers,
      p_ticket_qr_payload: qrPayload ?? undefined, p_draw_number: drawNumber ?? undefined, p_capture_method: captureMethod,
      p_reference: String(formData.get("reference") ?? "").trim() || undefined,
      p_notes: String(formData.get("notes") ?? "").trim() || undefined,
      p_status_notes: dailyStatus === "incomplete" ? (dailyStatusNotes || undefined) : undefined,
      p_reported_amount: reportedAmount,
    });
    renditionId = result.data; error = result.error;
  }
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("permiso")) redirect("/pagos?error=sin-permiso-rendicion&agent=" + encodeURIComponent(agentId));
    if (message.includes("monto rendido")) redirect("/pagos?error=monto-rendido-invalido&agent=" + encodeURIComponent(agentId));
    if (message.includes("jornada operativa cambió")) redirect("/pagos?error=jornada-cambio&agent=" + encodeURIComponent(agentId));
    if (message.includes("ya existe una rendición para este sorteo") || message.includes("duplicate key") || message.includes("unique constraint")) redirect("/pagos?error=sorteo-ya-rendido&agent=" + encodeURIComponent(agentId));
    if (message.includes("juegos que no corresponden al período")) redirect("/pagos?error=juegos-periodo-invalido&agent=" + encodeURIComponent(agentId));
    if (message.includes("fecha del sorteo debe coincidir")) redirect("/pagos?error=fecha-sorteo-invalida&agent=" + encodeURIComponent(agentId));
    if (message.includes("día no está programado")) redirect("/pagos?error=sorteo-no-programado&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=rendicion-fallida&agent=" + encodeURIComponent(agentId));
  }


  // El mismo envío registra el cobro: total si se confirma, parcial si queda incompleta.
  const paymentAmount = dailyStatus === "complete" ? totalDue : reportedAmount;
  const { error: paymentError } = await supabase.rpc("receive_agency_rendition", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_payment_date: todayInAgencyTimeZone(),
    p_amount: paymentAmount,
    p_cash_account_id: cashAccount.id,
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_notes: dailyStatus === "incomplete" ? "Pago parcial al registrar rendición incompleta" : "Cobro al confirmar rendición diaria",
  });
  if (paymentError) {
    redirect("/pagos?error=cobro-inicial-fallido&agent=" + encodeURIComponent(agentId));
  }
  let backupStatus: "cierre-diario" | "enviado" | "pendiente" | "dominio-no-verificado" = "cierre-diario";
  let photoStatus: "saved" | "skipped" | "failed" = "skipped";
  if (renditionId) {
    photoStatus = await storeRenditionTicketPhoto(supabase, organizationId, renditionId, formData);
    backupStatus = await sendRenditionBackup(supabase, renditionId);
  }

  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/equipo");
  redirect("/pagos?agent=" + agentId + "&resultado=rendicion-creada&backup=" + backupStatus + "&foto=" + (photoStatus === "failed" ? "no-adjunta" : photoStatus === "saved" ? "adjunta" : "sin-foto"));
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
    redirect("/agencias?error=baja-no-confirmada");
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
    const { error } = await supabase.rpc("archive_agency_agent", {
      p_organization_id: organizationId,
      p_agent_id: agentId,
      p_reason: "Baja solicitada desde la administración de agentes",
    });
    if (error) {
      if (error.message.toLowerCase().includes("permiso")) redirect("/agencias?error=sin-permiso-baja");
      redirect("/agencias?error=baja-fallida");
    }
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



export async function saveAgentRenditionPolicy(formData: FormData) {
  const { supabase, organizationId, role } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const policy = String(formData.get("rendition_policy") ?? "");
  const periods = formData.getAll("rendition_periods").map((value) => String(value));
  if (!agentId) redirect("/agencias?error=agente-no-encontrado");
  if (role !== "owner") redirect("/agencias/" + agentId + "?error=solo-titular-modalidad");
  const { error } = await supabase.rpc("update_agency_agent_rendition_policy", {
    p_organization_id: organizationId, p_agent_id: agentId, p_policy: policy, p_periods: periods,
  });
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("jornada con rendiciones")) redirect("/agencias/" + agentId + "?error=modalidad-bloqueada-jornada");
    if (message.includes("permiso") || message.includes("titular")) redirect("/agencias/" + agentId + "?error=solo-titular-modalidad");
    if (message.includes("seleccioná al menos un sorteo") || message.includes("cronograma") || message.includes("modalidad")) redirect("/agencias/" + agentId + "?error=modalidad-invalida");
    redirect("/agencias/" + agentId + "?error=modalidad-no-guardada");
  }
  revalidatePath("/agencias"); revalidatePath("/agencias/" + agentId); revalidatePath("/pagos");
  redirect("/agencias/" + agentId + "?resultado=modalidad-guardada");
}

export async function saveAgentGameCommissions(formData: FormData) {
  const { supabase, organizationId, role, userId } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  if (role !== "owner") redirect("/agencias?error=solo-titular-comisiones");
  if (!agentId) redirect("/agencias?error=agente-no-encontrado");
  const { data: agent, error: agentError } = await supabase.from("agency_agents").select("id,code").eq("id", agentId).eq("organization_id", organizationId).maybeSingle();
  if (agentError || !agent) redirect("/agencias?error=agente-no-encontrado");

  const submitted = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("commission_"))
    .map(([key, value]) => {
      const raw = String(value ?? "").trim();
      const percent = raw === "" ? null : Number(raw);
      return {
        organization_id: organizationId,
        agent_id: agentId,
        game_type_id: key.slice("commission_".length),
        commission_percent: percent,
        created_by: userId,
        updated_at: new Date().toISOString(),
      };
    });
  if (submitted.some((row) => row.commission_percent !== null && (!Number.isFinite(row.commission_percent) || row.commission_percent < 0 || row.commission_percent > 100))) {
    redirect("/agencias/" + agentId + "?error=comision-invalida");
  }

  const { data: games, error: gamesError } = await supabase.from("agency_game_types").select("id").eq("organization_id", organizationId);
  if (gamesError) redirect("/agencias/" + agentId + "?error=comisiones-no-guardadas");
  const allowed = new Set((games ?? []).map((game) => game.id));
  if (submitted.some((row) => !allowed.has(row.game_type_id))) redirect("/agencias/" + agentId + "?error=comision-invalida");

  const overrides = submitted.filter((row) => row.commission_percent !== null).map((row) => ({
    ...row,
    commission_percent: row.commission_percent as number,
  }));
  const clearOverrideIds = submitted.filter((row) => row.commission_percent === null).map((row) => row.game_type_id);

  if (overrides.length) {
    const { error } = await supabase.from("agency_agent_game_commissions").upsert(overrides, { onConflict: "organization_id,agent_id,game_type_id" });
    if (error) redirect("/agencias/" + agentId + "?error=comisiones-no-guardadas");
  }
  if (clearOverrideIds.length) {
    const { error } = await supabase.from("agency_agent_game_commissions").delete()
      .eq("organization_id", organizationId).eq("agent_id", agentId).in("game_type_id", clearOverrideIds);
    if (error) redirect("/agencias/" + agentId + "?error=comisiones-no-guardadas");
  }

  await supabase.from("audit_log").insert({
    organization_id: organizationId, user_id: userId, action: "update_agent_game_commissions",
    entity: "agency_agent", entity_id: agentId,
    payload: { override_count: overrides.length, cleared_overrides: clearOverrideIds.length },
  });
  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  revalidatePath("/juegos");
  redirect("/agencias/" + agentId + "?resultado=comisiones-guardadas");
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
    p_ticket_qr_payload: qrPayload ?? undefined,
    p_game_period: String(formData.get("game_period") ?? "").trim() || undefined,
    p_draw_number: String(formData.get("draw_number") ?? "").trim() || undefined,
    p_capture_method: captureMethod,
    p_reference: String(formData.get("reference") ?? "").trim() || undefined,
    p_notes: String(formData.get("notes") ?? "").trim() || undefined,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("cobros registrados") || message.includes("con cobros")) {
      redirect("/pagos?error=rendicion-con-cobros&agent=" + encodeURIComponent(agentId));
    }
    if (message.includes("permiso")) redirect("/pagos?error=sin-permiso-editar&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=edicion-fallida&agent=" + encodeURIComponent(agentId));
  }

  let backupStatus: "cierre-diario" | "enviado" | "pendiente" | "dominio-no-verificado" = "cierre-diario";
  let photoStatus: "saved" | "skipped" | "failed" = "skipped";
  if (updatedId) {
    photoStatus = await storeRenditionTicketPhoto(supabase, organizationId, updatedId, formData);
    backupStatus = await sendRenditionBackup(supabase, updatedId);
  }
  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/equipo");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=rendicion-corregida&backup=" + backupStatus + "&foto=" + (photoStatus === "failed" ? "no-adjunta" : photoStatus === "saved" ? "adjunta" : "sin-foto"));
}


export async function setAgencyDailyRenditionStatus(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const operationalDate = String(formData.get("operational_date") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const reportedAmountRaw = String(formData.get("reported_amount") ?? "").trim();
  const reportedAmount = Number(reportedAmountRaw.replace(",", "."));

  if (!permissions.can_create_renditions) redirect("/pagos?error=sin-permiso-rendicion");
  if (!agentId || !/^\d{4}-\d{2}-\d{2}$/.test(operationalDate) || !["complete", "incomplete"].includes(status)) {
    redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
  }

  const dateValue = new Date(operationalDate + "T00:00:00.000Z");
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== operationalDate) {
    redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
  }
  if (status === "incomplete" && (
    !reportedAmountRaw || !Number.isFinite(reportedAmount) || reportedAmount <= 0 || reportedAmount > 999999999999.99
  )) {
    redirect("/pagos?error=monto-rendido-invalido&agent=" + encodeURIComponent(agentId));
  }

  const { error } = await supabase.rpc("set_agency_agent_daily_status_with_amount", {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_operational_date: operationalDate,
    p_status: status,
    p_notes: notes || undefined,
    p_reported_amount: status === "incomplete" ? reportedAmount : null,
  });

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("monto rendido") || message.includes("ingresá un monto")) redirect("/pagos?error=monto-rendido-invalido&agent=" + encodeURIComponent(agentId));
    if (message.includes("no tenés permiso")) redirect("/pagos?error=sin-permiso-rendicion&agent=" + encodeURIComponent(agentId));
    if (message.includes("jornada operativa cambió")) redirect("/pagos?error=jornada-cambio&agent=" + encodeURIComponent(agentId));
    if (message.includes("no hay una rendición registrada")) redirect("/pagos?error=sin-rendicion-para-confirmar&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
  }

  revalidatePath("/pagos");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=" + (status === "complete" ? "estado-rendida" : "estado-incompleta"));
}

export async function setAgencyDrawRenditionStatus(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const operationalDate = String(formData.get("operational_date") ?? "").trim();
  const drawPeriod = String(formData.get("draw_period") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!permissions.can_create_renditions) redirect("/pagos?error=sin-permiso-rendicion&agent=" + encodeURIComponent(agentId));
  if (!agentId || !/^\\d{4}-\\d{2}-\\d{2}$/.test(operationalDate) || !drawPeriod || !["complete", "incomplete"].includes(status)) {
    redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
  }

  const { error } = await supabase.rpc("set_agency_agent_draw_status", {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_operational_date: operationalDate,
    p_draw_period: drawPeriod,
    p_status: status,
  });
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("jornada operativa cambió")) redirect("/pagos?error=jornada-cambio&agent=" + encodeURIComponent(agentId));
    if (message.includes("no hay una rendición activa")) redirect("/pagos?error=sorteo-sin-rendicion&agent=" + encodeURIComponent(agentId));
    if (message.includes("permiso")) redirect("/pagos?error=sin-permiso-rendicion&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
  }

  revalidatePath("/pagos");
  revalidatePath("/agencias");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=sorteo-rendido");
}

export async function sendAgencyBackupManually() {
  const { supabase, organizationId, role } = await getOrg();
  if (role !== "owner") redirect("/pagos?error=backup-solo-titular");

  const { data, error } = await supabase.functions.invoke("send-rendition-backup", {
    body: { manual_close: true, organization_id: organizationId },
  });

  let failurePayload: any = data ?? {};
  if (error) {
    const response = (error as any).context;
    if (response && typeof response.json === "function") {
      try {
        const readable = typeof response.clone === "function" ? response.clone() : response;
        failurePayload = { ...failurePayload, ...(await readable.json()) };
      } catch {
        // Keep the safe generic message if the response body is unavailable.
      }
    }
  }

  const batches = Array.isArray(failurePayload?.batches) ? failurePayload.batches : [];
  const failedBatch = batches.find((batch: any) => batch?.status !== "sent");
  const reason = [
    failurePayload?.message,
    failurePayload?.error,
    failedBatch?.error,
  ].filter(Boolean).map(String).join(" ");

  if (failurePayload?.status === "nothing_to_send" && !error) {
    revalidatePath("/pagos");
    redirect("/pagos?resultado=backup-sin-pendientes");
  }

  if (error || failurePayload?.status !== "daily_close_processed" || failedBatch) {
    if (/You can only send testing emails|verify a domain|domain.*verified/i.test(reason)) {
      redirect("/pagos?error=backup-dominio-no-verificado");
    }
    if (/RESEND_API_KEY|email_provider_not_configured/i.test(reason)) {
      redirect("/pagos?error=backup-configuracion");
    }
    if (/No hay correo de respaldo configurado/i.test(reason)) {
      redirect("/pagos?error=backup-destinatario");
    }
    redirect("/pagos?error=backup-no-enviado");
  }

  const copiedRenditions = batches.reduce(
    (total: number, batch: any) => total + Math.max(0, Number(batch?.renditions ?? 0)),
    0,
  );
  if (copiedRenditions <= 0) redirect("/pagos?resultado=backup-sin-pendientes");

  revalidatePath("/pagos");
  revalidatePath("/equipo");
  revalidatePath("/dashboard");
  redirect("/pagos?resultado=backup-manual-enviado&copias=" + copiedRenditions);
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
    p_reason: reason || undefined,
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("cobros registrados")) redirect("/pagos?error=rendicion-con-cobros&agent=" + encodeURIComponent(agentId));
    if (message.includes("permiso")) redirect("/pagos?error=sin-permiso-anular&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=anulacion-fallida&agent=" + encodeURIComponent(agentId));
  }

  const backupStatus = await sendRenditionBackup(supabase, renditionId);
  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/equipo");
  revalidatePath("/dashboard");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=rendicion-anulada&backup=" + backupStatus);
}
