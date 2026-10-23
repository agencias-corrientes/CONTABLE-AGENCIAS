"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOfficialAgencyGame } from "@/lib/agency-official-games";
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


function isConfirmedOfficialClosureTicket(formData: FormData): boolean {
  const raw = String(formData.get("ticket_receipt_data") ?? "").trim();
  if (!raw || raw.length > 200000) return false;
  try {
    const ticket = JSON.parse(raw);
    if (ticket?.type === "loteria-corrientes-end-of-day-v1") return ticket?.userConfirmedReview === true;
    return ticket?.type === "loteria-corrientes-end-of-day-batch-v1"
      && ticket?.userConfirmedReview === true
      && Array.isArray(ticket?.tickets)
      && ticket.tickets.length >= 1 && ticket.tickets.length <= 12
      && ticket.tickets.every((item: any) => item?.type === "loteria-corrientes-end-of-day-v1" && item?.userConfirmedReview === true);
  } catch {
    return false;
  }
}

function normalizeClosureReceiptDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    return raw;
  }
  const local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!local) return null;
  const day = Number(local[1]), month = Number(local[2]);
  const year = local[3]!.length === 2 ? Number("20" + local[3]) : Number(local[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}
function closureReceiptDuplicateKey(ticket: any): string | null {
  const period = String(ticket?.periodNumber ?? "").replace(/\s+/g, "");
  const printedDate = normalizeClosureReceiptDate(ticket?.closedAt?.date ?? ticket?.printedAt?.date ?? ticket?.openedAt?.date);
  if (!/^\d{7}$/.test(period) || !printedDate) return null;
  const agencyCode = String(ticket?.agencyCode ?? "").replace(/\D/g, "");
  const subagentCode = String(ticket?.subagentCode ?? "").replace(/\D/g, "");
  return agencyCode + "|" + subagentCode + "|" + period + "|" + printedDate;
}
function individualClosureReceipts(value: any): any[] {
  if (value?.type === "loteria-corrientes-end-of-day-v1") return [value];
  if (value?.type === "loteria-corrientes-end-of-day-batch-v1" && Array.isArray(value.tickets)) return value.tickets;
  return [];
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

async function storeRenditionTicketReceiptData(
  supabase: any,
  organizationId: string,
  renditionId: string,
  formData: FormData,
  clearWhenEmpty: boolean,
): Promise<"saved" | "none" | "failed"> {
  const raw = String(formData.get("ticket_receipt_data") ?? "").trim();
  if (!raw && !clearWhenEmpty) return "none";
  let receiptData: any = null;
  if (raw) {
    if (raw.length > 200000) return "failed";
    try { receiptData = JSON.parse(raw); } catch { return "failed"; }
    const single = receiptData?.type === "loteria-corrientes-end-of-day-v1" && raw.length <= 20000;
    const batch = receiptData?.type === "loteria-corrientes-end-of-day-batch-v1"
      && Array.isArray(receiptData.tickets) && receiptData.tickets.length >= 1 && receiptData.tickets.length <= 12
      && receiptData.userConfirmedReview === true
      && receiptData.tickets.every((item: any) => item?.type === "loteria-corrientes-end-of-day-v1" && item?.userConfirmedReview === true);
    if (!single && !batch) return "failed";
  }

  // Clearing OCR data from a normal (non-daily) rendition is an edit operation,
  // so keep it under the existing can_edit_renditions policy. Adding a closure
  // receipt after the financial insert uses the narrow SECURITY DEFINER RPC;
  // this works for authorized creators without broadening table UPDATE access.
  if (!receiptData && clearWhenEmpty) {
    const { data, error } = await supabase
      .from("agency_renditions")
      .update({ ticket_receipt_data: null })
      .eq("organization_id", organizationId)
      .eq("id", renditionId)
      .select("id")
      .maybeSingle();
    if (error || !data?.id) return "failed";
    return "none";
  }

  const { data, error } = await supabase.rpc("attach_agency_rendition_ticket_receipt_data", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_receipt_data: receiptData,
  });
  if (error || data !== true) return "failed";
  return receiptData ? "saved" : "none";
}

async function sendRenditionBackup(_supabase: any, _renditionId: string): Promise<"cierre-diario"> {
  // The audit trigger has already stored this revision in the outbox.
  // All queued revisions are sent together by the scheduled end-of-day job.
  return "cierre-diario";
}

export async function attachAgencyRenditionTicketReceiptDataToExisting(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const renditionId = String(formData.get("rendition_id") ?? "").trim();
  const returnTo = "/pagos?agent=" + encodeURIComponent(agentId);

  if (!agentId || !renditionId) redirect("/pagos?error=rendicion-invalida");
  if (!permissions.can_create_renditions && !permissions.can_edit_renditions) {
    redirect(returnTo + "&error=sin-permiso-ticket-ocr");
  }
  if (!isConfirmedOfficialClosureTicket(formData)) {
    redirect(returnTo + "&error=ticket-ocr-no-validado");
  }

  const result = await storeRenditionTicketReceiptData(supabase, organizationId, renditionId, formData, false);
  if (result !== "saved") redirect(returnTo + "&error=ticket-ocr-adjunto-fallido");

  revalidatePath("/pagos");
  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  redirect(returnTo + "&resultado=ticket-ocr-adjuntado");
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

  const { data: owningAgency, error: owningAgencyError } = await supabase
    .from("organizations")
    .select("agency_code,name")
    .eq("id", organizationId)
    .maybeSingle();
  if (owningAgencyError || !owningAgency) redirect("/agencias?error=agencia-no-configurada");
  const registeredAgencyCode = String(owningAgency.agency_code ?? "").trim()
    || String(owningAgency.name ?? "").match(/agencia[^0-9]*([0-9]{3})/i)?.[1]
    || (/^\d{3}$/.test(String(owningAgency.name ?? "").trim()) ? String(owningAgency.name).trim() : "");
  if (!registeredAgencyCode) redirect("/agencias?error=agencia-no-configurada");
  if (code.split("-")[0] !== registeredAgencyCode) {
    redirect("/agencias?error=agencia-ajena&codigo=" + encodeURIComponent(code));
  }

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
    if (normalized.includes("agency_agents_global_code_uq")) {
      redirect("/agencias?error=duplicado-global&tipo=" + kindLabel + "&codigo=" + encodeURIComponent(code));
    }
    if (error.code === "23505" || normalized.includes("ya está cargado") || normalized.includes("duplicate key")) {
      redirect("/agencias?error=duplicado&tipo=" + kindLabel + "&codigo=" + encodeURIComponent(code));
    }
    if (normalized.includes("permiso")) redirect("/agencias?error=sin-permiso-alta");
    redirect("/agencias?error=alta-fallida");
  }
  revalidatePath("/agencias");
  redirect("/agencias?resultado=creado&codigo=" + encodeURIComponent(code));
}

export async function updateAgencyAgentProfile(formData: FormData) {
  const { supabase, organizationId, role } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  if (role !== "owner") redirect("/agencias/" + encodeURIComponent(agentId) + "?error=solo-titular-editar-agente");

  const kind = String(formData.get("kind") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const dni = String(formData.get("dni") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!agentId) redirect("/agencias?error=agente-no-encontrado");
  if (!["subagent", "ambulant"].includes(kind) || !/^\d{3}-\d{3}-\d{2}$/.test(code) || !fullName) {
    redirect("/agencias/" + encodeURIComponent(agentId) + "?error=codigo-invalido");
  }

  const { error } = await (supabase as any).rpc("update_agency_agent_profile", {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_kind: kind,
    p_full_name: fullName,
    p_code: code,
    p_dni: dni || null,
    p_phone: phone || null,
    p_whatsapp: whatsapp || null,
    p_address: address || null,
    p_notes: notes || null,
  });

  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (error.code === "42501" || message.includes("solo el titular") || message.includes("sin permisos")) {
      redirect("/agencias/" + encodeURIComponent(agentId) + "?error=solo-titular-editar-agente");
    }
    if (error.code === "23505" || message.includes("agency_agents_global_code_uq") || message.includes("ese código ya está utilizado")) {
      redirect("/agencias/" + encodeURIComponent(agentId) + "?error=codigo-duplicado");
    }
    if (message.includes("debe comenzar con el número oficial") || message.includes("número oficial de agencia")) {
      redirect("/agencias/" + encodeURIComponent(agentId) + "?error=agente-codigo-ajeno");
    }
    redirect("/agencias/" + encodeURIComponent(agentId) + "?error=agente-datos-no-guardados");
  }

  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  redirect("/agencias/" + encodeURIComponent(agentId) + "?resultado=datos-agente-guardados");
}

export async function createAgencyRendition(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  if (!permissions.can_create_renditions) redirect("/pagos?error=sin-permiso-rendicion");
  const agentId = String(formData.get("agent_id") ?? "").trim();
  if (!agentId) redirect("/pagos?error=agente-no-encontrado");
  const { data: agentPolicyRow, error: policyLookupError } = await supabase.from("agency_agents")
    .select("code,rendition_policy,rendition_periods,rendition_frequency,rendition_weekdays").eq("id", agentId).eq("organization_id", organizationId).maybeSingle();
  if (policyLookupError || !agentPolicyRow) redirect("/pagos?error=agente-no-encontrado");
  const { data: agencyIdentity, error: agencyIdentityError } = await supabase
    .from("organizations")
    .select("agency_code,name")
    .eq("id", organizationId)
    .maybeSingle();
  if (agencyIdentityError || !agencyIdentity) {
    redirect("/pagos?error=agencia-identidad-no-configurada&agent=" + encodeURIComponent(agentId));
  }
  const registeredAgencyCode = String(agencyIdentity.agency_code ?? "").trim()
    || String(agencyIdentity.name ?? "").match(/agencia[^0-9]*([0-9]{3})/i)?.[1]
    || (/^[0-9]{3}$/.test(String(agencyIdentity.name ?? "").trim()) ? String(agencyIdentity.name).trim() : "");
  if (!registeredAgencyCode) {
    redirect("/pagos?error=agencia-identidad-no-configurada&agent=" + encodeURIComponent(agentId));
  }
  const selectedAgentCode = String(agentPolicyRow.code ?? "").trim();
  if (selectedAgentCode.split("-")[0] !== registeredAgencyCode) {
    redirect("/pagos?error=agente-codigo-ajeno&agent=" + encodeURIComponent(agentId));
  }
  const renditionPolicy = String(agentPolicyRow.rendition_policy ?? "daily");
  const renditionFrequency = String(agentPolicyRow.rendition_frequency ?? "daily");
  const renditionWeekdays = Array.isArray(agentPolicyRow.rendition_weekdays) ? agentPolicyRow.rendition_weekdays.map(String) : [];
  const selectedRenditionPeriods = Array.isArray(agentPolicyRow.rendition_periods) ? agentPolicyRow.rendition_periods.map(String) : [];
  const submittedDate = String(formData.get("rendition_date") ?? "").trim();
  const renditionDate = submittedDate || todayInAgencyTimeZone();
  const breakdown = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("game_"))
    .map(([key, value]) => ({ game_type_id: key.slice(5), amount: Number(value) }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
  const totalDue = breakdown.reduce((sum, item) => sum + item.amount, 0);
  const submittedGameIds = Array.from(new Set(breakdown.map((item) => item.game_type_id)));
  if (!submittedGameIds.length) redirect("/pagos?error=importe-invalido&agent=" + encodeURIComponent(agentId));
  const { data: submittedGames, error: submittedGamesError } = await supabase
    .from("agency_game_types")
    .select("id,name,enabled")
    .eq("organization_id", organizationId)
    .in("id", submittedGameIds);
  if (submittedGamesError || (submittedGames ?? []).length !== submittedGameIds.length ||
      (submittedGames ?? []).some((game) => !game.enabled || !getOfficialAgencyGame(game.name))) {
    redirect("/pagos?error=juegos-periodo-invalido&agent=" + encodeURIComponent(agentId));
  }
  const ticketNumbers = String(formData.get("ticket_numbers") ?? "")
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const operationalDate = String(formData.get("operational_date") ?? "").trim();
  const dailyStatus = String(formData.get("draw_status") ?? "").trim();
  const drawPeriod = String(formData.get("draw_period") ?? "").trim();
  const dailyStatusNotes = String(formData.get("daily_status_notes") ?? "").trim();
  const ticketReceiptRaw = String(formData.get("ticket_receipt_data") ?? "").trim();
  let identityTicket: any = null;
  if (ticketReceiptRaw && ticketReceiptRaw.length <= 20000) {
    try {
      const parsedTicket = JSON.parse(ticketReceiptRaw);
      if (parsedTicket?.type === "loteria-corrientes-end-of-day-v1") identityTicket = parsedTicket;
    } catch {
      identityTicket = null;
    }
  }
  // La agencia oficial 000 se reserva para pruebas del administrador central:
  // permite revisar tickets de cualquier agencia sin relajar las validaciones
  // de las agencias operativas.
  if (identityTicket && registeredAgencyCode !== "000") {
    const ticketAgencyDigits = String(identityTicket.agencyCode ?? "").replace(/\D/g, "");
    const ticketAgencyCode = ticketAgencyDigits.length === 4 && /^[01]\d{3}$/.test(ticketAgencyDigits)
      ? ticketAgencyDigits.slice(1)
      : ticketAgencyDigits;
    const expectedParts = selectedAgentCode.split("-");
    const ticketSubagentCode = String(identityTicket.subagentCode ?? "").replace(/\D/g, "");
    if (!ticketAgencyCode || !ticketSubagentCode) {
      redirect("/pagos?error=ticket-identificacion-no-verificada&agent=" + encodeURIComponent(agentId));
    }
    if (ticketAgencyCode !== registeredAgencyCode) {
      redirect("/pagos?error=ticket-agencia-ajena&agent=" + encodeURIComponent(agentId));
    }
    if (expectedParts.length >= 3) {
      const fullExpected = expectedParts.join("").replace(/\D/g, "");
      const localExpected = expectedParts[1] + expectedParts[2];
      const matchesFullExpected = ticketSubagentCode.length >= 7 && ticketSubagentCode === fullExpected;
      const matchesLocalNumber = ticketSubagentCode === localExpected;
      // Do not accept only the short subagent fragment: that could match a
      // different ambulant/subagent under the same agency.
      if (!matchesFullExpected && !matchesLocalNumber) {
        redirect("/pagos?error=ticket-subagente-ajeno&agent=" + encodeURIComponent(agentId));
      }
    }
  }
  // Only ticket identity checks are conditional; saving the rendition must run for
  // both official ticket closures and manual entries.
  const confirmedOfficialClosure = isConfirmedOfficialClosureTicket(formData);
  const reportedAmountRaw = String(formData.get("reported_amount") ?? "").trim();
  const [{ data: agentCommissionRows, error: agentCommissionError }, { data: defaultCommissionRows, error: defaultCommissionError }] = await Promise.all([
    supabase.from("agency_agent_game_commissions").select("game_type_id,commission_percent").eq("organization_id", organizationId).eq("agent_id", agentId).in("game_type_id", submittedGameIds),
    supabase.from("agency_game_commission_defaults").select("game_type_id,commission_percent").eq("organization_id", organizationId).in("game_type_id", submittedGameIds),
  ]);
  if (agentCommissionError || defaultCommissionError) {
    console.error("[rendicion] failed to read commission settings", {
      agentCommission: agentCommissionError ? { code: agentCommissionError.code, message: agentCommissionError.message } : null,
      defaultCommission: defaultCommissionError ? { code: defaultCommissionError.code, message: defaultCommissionError.message } : null,
    });
    redirect("/pagos?error=rendicion-fallida&agent=" + encodeURIComponent(agentId));
  }
  const agentCommissionByGame = new Map<string, number>((agentCommissionRows ?? []).map((row: any) => [String(row.game_type_id), Number(row.commission_percent)] as const));
  const defaultCommissionByGame = new Map<string, number>((defaultCommissionRows ?? []).map((row: any) => [String(row.game_type_id), Number(row.commission_percent)] as const));
  const commissionDue = breakdown.reduce((sum, item) => {
    const rate = agentCommissionByGame.has(item.game_type_id) ? agentCommissionByGame.get(item.game_type_id)! : defaultCommissionByGame.get(item.game_type_id) ?? 0;
    return sum + Math.round((item.amount * rate / 100 + Number.EPSILON) * 100) / 100;
  }, 0);
  const netDue = Math.max(0, Math.round((totalDue - commissionDue + Number.EPSILON) * 100) / 100);
  if (netDue <= 0) redirect("/pagos?error=importe-invalido&agent=" + encodeURIComponent(agentId));
  const reportedAmount = dailyStatus === "complete" ? netDue : Number(reportedAmountRaw.replace(",", "."));
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
  if (renditionFrequency === "weekly") {
    const weekdayKeys = ["sun","mon","tue","wed","thu","fri","sat"];
    const operationalWeekday = weekdayKeys[new Date(operationalDate + "T00:00:00.000Z").getUTCDay()];
    if (renditionPolicy !== "daily" || !renditionWeekdays.includes(operationalWeekday)) redirect("/pagos?error=dia-rendicion-no-habilitado&agent=" + encodeURIComponent(agentId));
    let batchReceipt: any = null;
    try { batchReceipt = ticketReceiptRaw ? JSON.parse(ticketReceiptRaw) : null; } catch { batchReceipt = null; }
    if (!batchReceipt || batchReceipt.type !== "loteria-corrientes-end-of-day-batch-v1" || !Array.isArray(batchReceipt.tickets) || batchReceipt.tickets.length < 1 || batchReceipt.tickets.length > 12) redirect("/pagos?error=lote-cupones-obligatorio&agent=" + encodeURIComponent(agentId));
    const keys = batchReceipt.tickets.map((item: any) => closureReceiptDuplicateKey(item));
    if (keys.some((key: string | null) => !key)) redirect("/pagos?error=lote-cupon-datos-incompletos&agent=" + encodeURIComponent(agentId));
    if (new Set(keys).size !== keys.length) redirect("/pagos?error=lote-cupon-duplicado&agent=" + encodeURIComponent(agentId));
    const printedDates = batchReceipt.tickets.map((item: any) => normalizeClosureReceiptDate(item?.closedAt?.date ?? item?.printedAt?.date ?? item?.openedAt?.date));
    if (printedDates.some((date: string | null) => !date || date > operationalDate)) redirect("/pagos?error=lote-fecha-invalida&agent=" + encodeURIComponent(agentId));
    const { data: previousClosures, error: previousClosuresError } = await supabase
      .from("agency_renditions").select("id,ticket_receipt_data")
      .eq("organization_id", organizationId).eq("agent_id", agentId).eq("game_period", "Cierre diario")
      .neq("status", "void").limit(1000);
    if (previousClosuresError) redirect("/pagos?error=lote-verificacion-fallida&agent=" + encodeURIComponent(agentId));
    const previousKeys = new Set<string>();
    for (const previous of previousClosures ?? []) {
      for (const receipt of individualClosureReceipts(previous.ticket_receipt_data)) {
        const key = closureReceiptDuplicateKey(receipt);
        if (key) previousKeys.add(key);
      }
    }
    if (keys.some((key: string) => previousKeys.has(key))) redirect("/pagos?error=lote-cupon-ya-rendido&agent=" + encodeURIComponent(agentId));
  }
  if ((renditionPolicy === "daily" && drawPeriod !== "Cierre diario") ||
      (renditionPolicy !== "daily" && drawPeriod === "Cierre diario") ||
      (renditionPolicy === "selected_draws" && !selectedRenditionPeriods.includes(drawPeriod))) {
    redirect("/pagos?error=modalidad-sorteo-invalido&agent=" + encodeURIComponent(agentId));
  }
  if (dailyStatus === "incomplete" && (
    !reportedAmountRaw ||
    !Number.isFinite(reportedAmount) ||
    reportedAmount <= 0 ||
    reportedAmount > netDue ||
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
  if (cashLookupError) redirect("/pagos?error=caja-no-configurada&agent=" + encodeURIComponent(agentId));
  let cashAccountId: string | null = cashAccount?.id ?? null;
  if (!cashAccountId) {
    const { data: fallbackCash, error: fallbackCashError } = await supabase
      .from("cash_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("name", "Caja principal")
      .maybeSingle();
    if (fallbackCashError) redirect("/pagos?error=caja-no-configurada&agent=" + encodeURIComponent(agentId));
    cashAccountId = fallbackCash?.id ?? null;
  }
  if (!cashAccountId) redirect("/pagos?error=caja-no-configurada&agent=" + encodeURIComponent(agentId));
  let renditionId: string | undefined;
  let error: any = null;
  if (renditionPolicy === "daily") {
    const result = await supabase.rpc("create_and_receive_agency_daily_rendition", {
      p_organization_id: organizationId, p_agent_id: agentId, p_rendition_date: renditionDate,
      p_amount_due: totalDue, p_operational_date: operationalDate, p_daily_status: dailyStatus,
      p_cash_account_id: cashAccountId!, p_payment_date: todayInAgencyTimeZone(),
      p_game_breakdown: breakdown, p_ticket_numbers: ticketNumbers, p_ticket_qr_payload: qrPayload ?? undefined,
      p_game_period: drawPeriod, p_draw_number: drawNumber ?? undefined, p_capture_method: captureMethod,
      p_reference: String(formData.get("reference") ?? "").trim() || undefined,
      p_notes: String(formData.get("notes") ?? "").trim() || undefined,
      p_daily_status_notes: dailyStatus === "incomplete"
        ? (dailyStatusNotes || undefined)
        : confirmedOfficialClosure ? "__CONFIRMED_OFFICIAL_CLOSURE__" : undefined,
      p_reported_amount: reportedAmount,
    });
    renditionId = result.data ?? undefined; error = result.error;
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
    renditionId = result.data ?? undefined; error = result.error;
  }
  if (error) {
    console.error("[rendicion] database rejected rendition save", {
      rpc: renditionPolicy === "daily" ? "create_and_receive_agency_daily_rendition" : "create_agency_rendition_with_capture_and_draw_status",
      code: error.code ?? null,
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
    });
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("permiso")) redirect("/pagos?error=sin-permiso-rendicion&agent=" + encodeURIComponent(agentId));
    if (message.includes("monto rendido")) redirect("/pagos?error=monto-rendido-invalido&agent=" + encodeURIComponent(agentId));
    if (message.includes("jornada operativa cambió")) redirect("/pagos?error=jornada-cambio&agent=" + encodeURIComponent(agentId));
    if (message.includes("ya existe una rendición para este sorteo") || message.includes("duplicate key") || message.includes("unique constraint")) redirect("/pagos?error=sorteo-ya-rendido&agent=" + encodeURIComponent(agentId));
    if (message.includes("juegos que no corresponden al período")) redirect("/pagos?error=juegos-periodo-invalido&agent=" + encodeURIComponent(agentId));
    if (message.includes("fecha de la rendición debe coincidir") || message.includes("fecha del sorteo debe coincidir")) redirect("/pagos?error=fecha-sorteo-invalida&agent=" + encodeURIComponent(agentId));
    if (message.includes("confirmación completa se habilita") || message.includes("último sorteo programado")) redirect("/pagos?error=cierre-diario-antes-de-hora&agent=" + encodeURIComponent(agentId));
    if (message.includes("día no está programado")) redirect("/pagos?error=sorteo-no-programado&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=rendicion-fallida&agent=" + encodeURIComponent(agentId));
  }


  if (!renditionId) redirect("/pagos?error=rendicion-fallida&agent=" + encodeURIComponent(agentId));

  // La rendición diaria ya registra el cobro dentro de la misma transacción SQL.
  // Para la modalidad por sorteo se conserva el flujo vigente.
  if (renditionPolicy !== "daily") {
    const paymentAmount = dailyStatus === "complete" ? netDue : reportedAmount;
    const { error: paymentError } = await supabase.rpc("receive_agency_rendition", {
      p_organization_id: organizationId,
      p_rendition_id: renditionId,
      p_payment_date: todayInAgencyTimeZone(),
      p_amount: paymentAmount,
      p_cash_account_id: cashAccountId as string,
      p_reference: String(formData.get("reference") ?? "").trim() || undefined,
      p_notes: dailyStatus === "incomplete" ? "Pago parcial al registrar rendición incompleta" : "Cobro al confirmar rendición diaria",
    });
    if (paymentError) redirect("/pagos?error=cobro-inicial-fallido&agent=" + encodeURIComponent(agentId));
  }
  let backupStatus: "cierre-diario" | "enviado" | "pendiente" | "dominio-no-verificado" = "cierre-diario";
  let photoStatus: "saved" | "skipped" | "failed" = "skipped";
  let ticketReceiptStatus: "saved" | "none" | "failed" = "none";
  if (renditionId) {
    photoStatus = await storeRenditionTicketPhoto(supabase, organizationId, renditionId, formData);
    ticketReceiptStatus = await storeRenditionTicketReceiptData(supabase, organizationId, renditionId, formData, false);
    backupStatus = await sendRenditionBackup(supabase, renditionId);
  }

  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/equipo");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=rendicion-creada&backup=" + backupStatus + "&foto=" + (photoStatus === "failed" ? "no-adjunta" : photoStatus === "saved" ? "adjunta" : "sin-foto") + "&ticket=" + (ticketReceiptStatus === "failed" ? "error" : ticketReceiptStatus === "saved" ? "guardado" : "sin-datos"));
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
  if (cashLookupError) {
    console.error("[receiveAgencyRendition] Caja lookup failed", { code: cashLookupError.code, message: cashLookupError.message, organizationId });
    redirect("/pagos?error=cobro-caja-no-disponible&agent=" + encodeURIComponent(agentId));
  }

  let cajaId = cashAccount?.id ?? null;
  if (!cajaId) {
    const { data: fallbackCash, error: fallbackError } = await supabase
      .from("cash_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("name", "Caja principal")
      .maybeSingle();
    if (fallbackError) {
      console.error("[receiveAgencyRendition] fallback Caja lookup failed", { code: fallbackError.code, message: fallbackError.message, organizationId });
      redirect("/pagos?error=cobro-caja-no-disponible&agent=" + encodeURIComponent(agentId));
    }
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
    console.error("[receiveAgencyRendition] RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      organizationId,
      renditionId,
      agentId,
    });
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("permiso")) redirect("/pagos?error=sin-permiso-cobro");
    if (message.includes("supera") || message.includes("saldo pendiente")) redirect("/pagos?error=cobro-supera-saldo&agent=" + encodeURIComponent(agentId));
    if (message.includes("caja") || message.includes("cuenta")) redirect("/pagos?error=cobro-caja-no-disponible&agent=" + encodeURIComponent(agentId));
    if (message.includes("rendición vigente") || message.includes("rendicion vigente") || message.includes("rendición") || message.includes("rendicion")) redirect("/pagos?error=cobro-rendicion-no-disponible&agent=" + encodeURIComponent(agentId));
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

  const { data: deletedAgent, error } = await supabase
    .from("agency_agents")
    .delete()
    .eq("id", agentId)
    .eq("organization_id", organizationId)
    .select("id,code")
    .maybeSingle();
  if (error) {
    if (error.code === "42501" || error.message.toLowerCase().includes("permission")) redirect("/agencias?error=sin-permiso-baja");
    redirect("/agencias?error=baja-fallida");
  }
  // RLS can filter a DELETE without returning a database error. Never report success unless one row was actually removed.
  if (!deletedAgent) redirect("/agencias?error=baja-fallida");

  revalidatePath("/agencias");
  revalidatePath("/pagos");
  redirect("/agencias?resultado=eliminado&codigo=" + encodeURIComponent(deletedAgent.code ?? agent.code ?? ""));
}



export async function saveAgentRenditionPolicy(formData: FormData) {
  const { supabase, organizationId, role } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  let policy = String(formData.get("rendition_policy") ?? "");
  const periods = formData.getAll("rendition_periods").map((value) => String(value));
  const frequency = String(formData.get("rendition_frequency") ?? "daily");
  const weekdays = formData.getAll("rendition_weekdays").map((value) => String(value));
  if (!agentId) redirect("/agencias?error=agente-no-encontrado");
  if (role !== "owner") redirect("/agencias/" + agentId + "?error=solo-titular-modalidad");
  if (!["daily", "weekly"].includes(frequency) ||
      (frequency === "weekly" && (!weekdays.length || weekdays.some((day) => !["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(day))))) {
    redirect("/agencias/" + agentId + "?error=modalidad-invalida");
  }
  // Weekly batches always use the official FIN DE JORNADA settlement.
  if (frequency === "weekly") policy = "daily";
  const { error } = await supabase.rpc("update_agency_agent_rendition_policy", {
    p_organization_id: organizationId, p_agent_id: agentId,
    p_policy: policy, p_periods: policy === "selected_draws" ? periods : [],
  });
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("jornada con rendiciones")) redirect("/agencias/" + agentId + "?error=modalidad-bloqueada-jornada");
    if (message.includes("permiso") || message.includes("titular")) redirect("/agencias/" + agentId + "?error=solo-titular-modalidad");
    if (message.includes("seleccioná al menos un sorteo") || message.includes("cronograma") || message.includes("modalidad")) redirect("/agencias/" + agentId + "?error=modalidad-invalida");
    redirect("/agencias/" + agentId + "?error=modalidad-no-guardada");
  }
  const scheduleResult = await supabase.rpc("update_agency_agent_rendition_schedule", {
    p_organization_id: organizationId, p_agent_id: agentId,
    p_frequency: frequency, p_weekdays: weekdays,
  });
  if (scheduleResult.error) {
    const message = String(scheduleResult.error.message ?? "").toLowerCase();
    if (message.includes("permiso") || message.includes("titular")) redirect("/agencias/" + agentId + "?error=solo-titular-modalidad");
    redirect("/agencias/" + agentId + "?error=modalidad-invalida");
  }
  revalidatePath("/agencias"); revalidatePath("/agencias/" + agentId); revalidatePath("/pagos");
  redirect("/agencias/" + encodeURIComponent(agentId) + "?resultado=modalidad-guardada");
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
  let ticketReceiptStatus: "saved" | "none" | "failed" = "none";
  if (updatedId) {
    photoStatus = await storeRenditionTicketPhoto(supabase, organizationId, updatedId, formData);
    ticketReceiptStatus = await storeRenditionTicketReceiptData(supabase, organizationId, updatedId, formData, true);
    backupStatus = await sendRenditionBackup(supabase, updatedId);
  }
  revalidatePath("/agencias");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/pagos");
  revalidatePath("/equipo");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=rendicion-corregida&backup=" + backupStatus + "&foto=" + (photoStatus === "failed" ? "no-adjunta" : photoStatus === "saved" ? "adjunta" : "sin-foto") + "&ticket=" + (ticketReceiptStatus === "failed" ? "error" : ticketReceiptStatus === "saved" ? "guardado" : "sin-datos"));
}


export async function correctAgencyDailyRenditionAmount(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const renditionId = String(formData.get("rendition_id") ?? "").trim();
  const amountRaw = String(formData.get("new_net_amount") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const amount = Number(amountRaw.replace(",", "."));
  const fail = (code: string): never => redirect("/pagos?error=" + encodeURIComponent(code) + "&agent=" + encodeURIComponent(agentId));

  if (!permissions.can_edit_renditions) fail("sin-permiso-editar");
  if (!agentId || !renditionId) fail("rendicion-invalida");
  if (formData.get("confirm_correction") !== "yes" || !reason || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) {
    fail("cierre-diario-importe-invalido");
  }

  const { error } = await supabase.rpc("correct_agency_daily_rendition_net_amount", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_new_net_amount: Math.round(amount * 100) / 100,
    p_reason: reason.slice(0, 1000),
  });
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("permiso") || message.includes("permission denied") || message.includes("row-level security")) fail("sin-permiso-editar");
    if (message.includes("caja") || message.includes("movimiento") || message.includes("cobro vinculado") || message.includes("pagos vinculados") || message.includes("importe del cierre")) fail("cierre-diario-caja-inconsistente");
    if (message.includes("solo se puede corregir") || message.includes("no se puede corregir") || message.includes("cerrado")) fail("cierre-diario-no-se-puede-corregir");
    fail("cierre-diario-correccion-fallida");
  }

  const backupStatus = await sendRenditionBackup(supabase, renditionId);
  revalidatePath("/pagos");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=cierre-diario-corregido&backup=" + backupStatus);
}

export async function annulAgencyDailyRendition(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const renditionId = String(formData.get("rendition_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const fail = (code: string): never => redirect("/pagos?error=" + encodeURIComponent(code) + "&agent=" + encodeURIComponent(agentId));

  if (!permissions.can_delete_renditions) fail("sin-permiso-anular");
  if (!agentId || !renditionId || formData.get("confirm_void") !== "yes" || !reason) {
    fail("cierre-diario-anulacion-confirmacion");
  }

  const { error } = await supabase.rpc("annul_agency_daily_rendition", {
    p_organization_id: organizationId,
    p_rendition_id: renditionId,
    p_reason: reason.slice(0, 1000),
  });
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("permiso")) fail("sin-permiso-anular");
    if (message.includes("movimiento") || message.includes("caja") || message.includes("cobro vinculado")) fail("cierre-diario-caja-inconsistente");
    fail("cierre-diario-anulacion-fallida");
  }

  const backupStatus = await sendRenditionBackup(supabase, renditionId);
  revalidatePath("/pagos");
  revalidatePath("/agencias/" + agentId);
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=cierre-diario-anulado&backup=" + backupStatus);
}


export async function setAgencyDailyRenditionStatus(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const operationalDate = String(formData.get("operational_date") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const reportedAmountRaw = String(formData.get("reported_amount") ?? "").trim();
  const reportedAmount = Number(reportedAmountRaw.replace(",", "."));
  if (!permissions.can_create_renditions) redirect("/pagos?error=sin-permiso-rendicion&agent=" + encodeURIComponent(agentId));
  if (!agentId || !/^\d{4}-\d{2}-\d{2}$/.test(operationalDate) || !["complete", "incomplete"].includes(status)) redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
  const dateValue = new Date(operationalDate + "T00:00:00.000Z");
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== operationalDate) redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));

  if (status === "complete") {
    const { data: cashAccount, error: cashError } = await supabase.from("cash_accounts").select("id").eq("organization_id", organizationId).eq("is_active", true).eq("name", "Caja").maybeSingle();
    if (cashError) redirect("/pagos?error=caja-no-configurada&agent=" + encodeURIComponent(agentId));
    let cashAccountId: string | null = cashAccount?.id ?? null;
    if (!cashAccountId) {
      const { data: fallbackCash, error: fallbackCashError } = await supabase.from("cash_accounts").select("id").eq("organization_id", organizationId).eq("is_active", true).eq("name", "Caja principal").maybeSingle();
      if (fallbackCashError) redirect("/pagos?error=caja-no-configurada&agent=" + encodeURIComponent(agentId));
      cashAccountId = fallbackCash?.id ?? null;
    }
    if (!cashAccountId) redirect("/pagos?error=caja-no-configurada&agent=" + encodeURIComponent(agentId));
    const { error } = await supabase.rpc("confirm_agency_daily_rendition", {
      p_organization_id: organizationId, p_agent_id: agentId, p_operational_date: operationalDate,
      p_cash_account_id: cashAccountId, p_payment_date: todayInAgencyTimeZone(), p_notes: notes || undefined,
    });
    if (error) {
      const message = String(error.message ?? "").toLowerCase();
      if (message.includes("permiso") || message.includes("permission denied") || message.includes("row-level security")) redirect("/pagos?error=sin-permiso-cobro&agent=" + encodeURIComponent(agentId));
      if (message.includes("caja") || message.includes("cash account")) redirect("/pagos?error=caja-no-configurada&agent=" + encodeURIComponent(agentId));
      if (message.includes("jornada operativa cambió")) redirect("/pagos?error=jornada-cambio&agent=" + encodeURIComponent(agentId));
      if (message.includes("no hay una rendición diaria")) redirect("/pagos?error=sin-rendicion-para-confirmar&agent=" + encodeURIComponent(agentId));
      redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
    }
    revalidatePath("/pagos"); revalidatePath("/agencias/" + agentId); revalidatePath("/movimientos"); revalidatePath("/dashboard");
    redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=estado-rendida");
  }

  if (!reportedAmountRaw || !Number.isFinite(reportedAmount) || reportedAmount <= 0 || reportedAmount > 999999999999.99) redirect("/pagos?error=monto-rendido-invalido&agent=" + encodeURIComponent(agentId));
  const { error } = await supabase.rpc("set_agency_agent_daily_status_with_amount", {
    p_organization_id: organizationId, p_agent_id: agentId, p_operational_date: operationalDate,
    p_status: status, p_notes: notes || undefined, p_reported_amount: reportedAmount,
  });
  if (error) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("monto rendido") || message.includes("ingresá un monto")) redirect("/pagos?error=monto-rendido-invalido&agent=" + encodeURIComponent(agentId));
    if (message.includes("no tenés permiso")) redirect("/pagos?error=sin-permiso-rendicion&agent=" + encodeURIComponent(agentId));
    if (message.includes("jornada operativa cambió")) redirect("/pagos?error=jornada-cambio&agent=" + encodeURIComponent(agentId));
    if (message.includes("no hay una rendición registrada")) redirect("/pagos?error=sin-rendicion-para-confirmar&agent=" + encodeURIComponent(agentId));
    redirect("/pagos?error=estado-sorteo-fallido&agent=" + encodeURIComponent(agentId));
  }
  revalidatePath("/pagos"); revalidatePath("/agencias/" + agentId);
  redirect("/pagos?agent=" + encodeURIComponent(agentId) + "&resultado=estado-incompleta");
}

export async function setAgencyDrawRenditionStatus(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const operationalDate = String(formData.get("operational_date") ?? "").trim();
  const drawPeriod = String(formData.get("draw_period") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!permissions.can_create_renditions) redirect("/pagos?error=sin-permiso-rendicion&agent=" + encodeURIComponent(agentId));
  if (!agentId || !/^\d{4}-\d{2}-\d{2}$/.test(operationalDate) || !drawPeriod || !["complete", "incomplete"].includes(status)) {
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

export async function createAgencyPrizePayment(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const returnAgentRaw = String(formData.get("return_agent_id") ?? "").trim();
  const returnAgentId = /^[-0-9a-f]{0,36}$/i.test(returnAgentRaw) ? returnAgentRaw : "";
  const returnSuffix = returnAgentId ? "&agent=" + encodeURIComponent(returnAgentId) : "";
  const fail = (code: string): never => redirect("/pagos?error=" + encodeURIComponent(code) + returnSuffix);

  if (!permissions.can_register_payments) fail("sin-permiso-cobro");
  const couponNumber = String(formData.get("coupon_number") ?? "").trim();
  const normalizedCoupon = couponNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!couponNumber || couponNumber.length > 128 || !normalizedCoupon) fail("premio-cupon-invalido");

  const rawAmount = String(formData.get("prize_amount") ?? "").trim();
  let amountText = rawAmount.replace(/[^0-9,.-]/g, "");
  if (amountText.includes(".") && amountText.includes(",")) {
    amountText = amountText.replace(/\./g, "").replace(",", ".");
  } else if (amountText.includes(",")) {
    const decimals = amountText.length - amountText.lastIndexOf(",") - 1;
    amountText = decimals > 0 && decimals <= 2
      ? amountText.replace(/\./g, "").replace(",", ".")
      : amountText.replace(/,/g, "");
  } else if (amountText.includes(".")) {
    const chunks = amountText.split(".");
    if ((chunks[chunks.length - 1] ?? "").length === 3) amountText = chunks.join("");
  }
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) fail("premio-importe-invalido");

  const selectedMethod = String(formData.get("capture_method") ?? "manual");
  const qrPayload = String(formData.get("qr_payload") ?? "").trim();
  const includedInTicketOcr = formData.get("included_in_ticket_ocr") === "on";
  const captureMethod = selectedMethod === "qr" || qrPayload ? "qr" : selectedMethod === "photo" ? "photo" : "manual";
  const gameName = String(formData.get("game_name") ?? "").trim().slice(0, 120);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);
  const photoValue = formData.get("prize_photo");
  let photoPath: string | undefined;

  if (photoValue instanceof File && photoValue.size > 0) {
    if (photoValue.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(photoValue.type)) {
      fail("premio-foto-invalida");
    }
    const extension = photoValue.type === "image/png" ? "png" : photoValue.type === "image/webp" ? "webp" : "jpg";
    photoPath = organizationId + "/prizes/" + crypto.randomUUID() + "." + extension;
    const { error: photoError } = await supabase.storage
      .from("agency-rendition-tickets")
      .upload(photoPath, photoValue, { contentType: photoValue.type, upsert: false, cacheControl: "3600" });
    if (photoError) {
      console.error("[premio] photo upload failed", { code: photoError.name, message: photoError.message });
      fail("premio-foto-fallida");
    }
  }

  const { data: cashAccount, error: cashError } = await supabase
    .from("cash_accounts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .eq("name", "Caja")
    .maybeSingle();

  let cashAccountId = cashAccount?.id ?? null;
  if (cashError) {
    if (photoPath) await supabase.storage.from("agency-rendition-tickets").remove([photoPath]);
    fail("caja-no-configurada");
  }
  if (!cashAccountId) {
    const { data: fallbackCash, error: fallbackError } = await supabase
      .from("cash_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .eq("name", "Caja principal")
      .maybeSingle();
    if (fallbackError) {
      if (photoPath) await supabase.storage.from("agency-rendition-tickets").remove([photoPath]);
      fail("caja-no-configurada");
    }
    cashAccountId = fallbackCash?.id ?? null;
  }
  if (!cashAccountId) {
    if (photoPath) await supabase.storage.from("agency-rendition-tickets").remove([photoPath]);
    fail("caja-no-configurada");
  }

  const { error } = await supabase.rpc("register_agency_prize_payment_with_ocr_status", {
    p_organization_id: organizationId,
    p_cash_account_id: cashAccountId as string,
    p_coupon_number: couponNumber,
    p_prize_amount: Math.round(amount * 100) / 100,
    p_payment_date: todayInAgencyTimeZone(),
    p_capture_method: captureMethod,
    p_included_in_ticket_ocr: includedInTicketOcr,
    p_game_name: gameName || undefined,
    p_qr_payload: qrPayload || undefined,
    p_photo_path: photoPath,
    p_notes: notes || undefined,
  });

  if (error) {
    if (photoPath) await supabase.storage.from("agency-rendition-tickets").remove([photoPath]);
    const normalized = error.message.toLowerCase();
    if (error.code === "23505" || normalized.includes("ya tiene un premio pagado") || normalized.includes("agency_prize_payments_org_coupon_uq")) {
      fail("premio-duplicado");
    }
    if (normalized.includes("permiso") || error.code === "42501") fail("sin-permiso-cobro");
    console.error("[premio] register failed", { code: error.code, message: error.message, details: error.details });
    fail("premio-registro-fallido");
  }

  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  revalidatePath("/movimientos");
  redirect("/pagos?resultado=premio-pagado" + (returnAgentId ? "&agent=" + encodeURIComponent(returnAgentId) : ""));
}

function parsePrizeAmount(value: string): number {
  let amountText = value.trim().replace(/[^0-9,.-]/g, "");
  if (amountText.includes(".") && amountText.includes(",")) {
    amountText = amountText.replace(/\./g, "").replace(",", ".");
  } else if (amountText.includes(",")) {
    const decimals = amountText.length - amountText.lastIndexOf(",") - 1;
    amountText = decimals > 0 && decimals <= 2
      ? amountText.replace(/\./g, "").replace(",", ".")
      : amountText.replace(/,/g, "");
  } else if (amountText.includes(".")) {
    const chunks = amountText.split(".");
    if ((chunks[chunks.length - 1] ?? "").length === 3) amountText = chunks.join("");
  }
  return Number(amountText);
}

export async function updateAgencyPrizePayment(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const returnAgentRaw = String(formData.get("return_agent_id") ?? "").trim();
  const returnAgentId = /^[-0-9a-f]{0,36}$/i.test(returnAgentRaw) ? returnAgentRaw : "";
  const returnSuffix = returnAgentId ? "&agent=" + encodeURIComponent(returnAgentId) : "";
  const fail = (code: string): never => redirect("/pagos?error=" + encodeURIComponent(code) + returnSuffix);
  if (!permissions.can_register_payments) fail("sin-permiso-cobro");

  const paymentId = String(formData.get("prize_payment_id") ?? "").trim();
  const couponNumber = String(formData.get("coupon_number") ?? "").trim();
  const normalizedCoupon = couponNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const amount = parsePrizeAmount(String(formData.get("prize_amount") ?? ""));
  const paymentDate = String(formData.get("payment_date") ?? "").trim();
  const parsedDate = new Date(paymentDate + "T00:00:00.000Z");
  if (!paymentId) fail("premio-no-encontrado");
  if (!couponNumber || couponNumber.length > 128 || !normalizedCoupon) fail("premio-cupon-invalido");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99) fail("premio-importe-invalido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== paymentDate) fail("premio-fecha-invalida");

  const { error } = await supabase.rpc("update_agency_prize_payment", {
    p_organization_id: organizationId,
    p_prize_payment_id: paymentId,
    p_coupon_number: couponNumber,
    p_game_name: String(formData.get("game_name") ?? "").trim().slice(0, 120) || undefined,
    p_prize_amount: Math.round(amount * 100) / 100,
    p_payment_date: paymentDate,
    p_notes: String(formData.get("notes") ?? "").trim().slice(0, 1000) || undefined,
    p_included_in_ticket_ocr: formData.get("included_in_ticket_ocr") === "on",
  });
  if (error) {
    const normalized = error.message.toLowerCase();
    if (error.code === "23505" || normalized.includes("cupón ya tiene") || normalized.includes("agency_prize_payments_org_coupon_uq")) fail("premio-duplicado");
    if (normalized.includes("movimiento") || normalized.includes("caja")) fail("premio-movimiento-inconsistente");
    if (normalized.includes("permiso") || error.code === "42501") fail("sin-permiso-cobro");
    console.error("[premio] update failed", { code: error.code, message: error.message, details: error.details });
    fail("premio-actualizacion-fallida");
  }
  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  revalidatePath("/movimientos");
  redirect("/pagos?resultado=premio-corregido" + (returnAgentId ? "&agent=" + encodeURIComponent(returnAgentId) : ""));
}

export async function deleteAgencyPrizePayment(formData: FormData) {
  const { supabase, organizationId, permissions } = await getOrg();
  const returnAgentRaw = String(formData.get("return_agent_id") ?? "").trim();
  const returnAgentId = /^[-0-9a-f]{0,36}$/i.test(returnAgentRaw) ? returnAgentRaw : "";
  const returnSuffix = returnAgentId ? "&agent=" + encodeURIComponent(returnAgentId) : "";
  const fail = (code: string): never => redirect("/pagos?error=" + encodeURIComponent(code) + returnSuffix);
  if (!permissions.can_register_payments) fail("sin-permiso-cobro");
  const paymentId = String(formData.get("prize_payment_id") ?? "").trim();
  if (!paymentId) fail("premio-no-encontrado");

  const { error } = await supabase.rpc("delete_agency_prize_payment", {
    p_organization_id: organizationId,
    p_prize_payment_id: paymentId,
  });
  if (error) {
    const normalized = error.message.toLowerCase();
    if (normalized.includes("movimiento") || normalized.includes("caja")) fail("premio-movimiento-inconsistente");
    if (normalized.includes("permiso") || error.code === "42501") fail("sin-permiso-cobro");
    console.error("[premio] delete failed", { code: error.code, message: error.message, details: error.details });
    fail("premio-eliminacion-fallida");
  }
  revalidatePath("/pagos");
  revalidatePath("/dashboard");
  revalidatePath("/movimientos");
  redirect("/pagos?resultado=premio-eliminado" + (returnAgentId ? "&agent=" + encodeURIComponent(returnAgentId) : ""));
}

