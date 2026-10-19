
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

const DAILY_CLOSE_CRON_SECRET_SHA256 =
  "eb9a0fcfbf3e942ea3530ced14b5976aff59c6a64f426d10577a875ac804cceb";

const AGENCY_TIME_ZONE = "America/Argentina/Cordoba";
const HISTORICAL_BACKUP_SUBJECT_PREFIX = "[HISTÓRICO · ENVÍO MANUAL] ";

function formatBackupAmount(value: unknown): string {
  return Number(value ?? 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function historicalMetric(label: string, value: any): string[] {
  if (!value || typeof value !== "object") return [];
  const count = value.count;
  const amount = value.amount;
  if (count == null && amount == null) return [];
  const parts: string[] = [];
  if (count != null && Number.isFinite(Number(count))) parts.push("cantidad " + String(count));
  if (amount != null && Number.isFinite(Number(amount))) parts.push("importe $ " + formatBackupAmount(amount));
  return [label + ": " + parts.join(" · ")];
}

function historicalReceiptLines(value: any): string[] {
  if (!value || typeof value !== "object") return [];
  const tickets = value.type === "loteria-corrientes-end-of-day-batch-v1" && Array.isArray(value.tickets)
    ? value.tickets
    : [value];
  const lines: string[] = [];
  tickets.forEach((ticket: any, index: number) => {
    if (!ticket || typeof ticket !== "object") return;
    if (tickets.length > 1) lines.push("Ticket OCR " + (index + 1) + " de " + tickets.length);
    const identifiers: [string, unknown][] = [
      ["Agencia del ticket", ticket.agencyCode],
      ["Subagencia", ticket.subagentCode],
      ["Máquina", ticket.machineCode],
      ["Terminal", ticket.terminalId],
      ["Domicilio", ticket.address],
      ["Período", ticket.periodNumber],
      ["Impreso", ticket.printedAt?.date && ticket.printedAt?.time ? String(ticket.printedAt.date) + " " + String(ticket.printedAt.time) : ticket.printedAt?.date ?? ticket.printedAt?.time],
      ["Cierre", ticket.closedAt?.date && ticket.closedAt?.time ? String(ticket.closedAt.date) + " " + String(ticket.closedAt.time) : ticket.closedAt?.date ?? ticket.closedAt?.time],
    ];
    for (const [label, raw] of identifiers) {
      const text = String(raw ?? "").trim();
      if (text) lines.push(label + ": " + text);
    }
    lines.push(...historicalMetric("Quiniela · válidos", ticket.quiniela?.valids));
    lines.push(...historicalMetric("Quiniela · premios pagados", ticket.quiniela?.prizesPaid));
    lines.push(...historicalMetric("Quiniela al Toque · válidos", ticket.quinielaAlToque?.valids));
    lines.push(...historicalMetric("Quiniela al Toque · premios pagados", ticket.quinielaAlToque?.prizesPaid));
    if (Array.isArray(ticket.otherGames)) {
      for (const game of ticket.otherGames) {
        const name = String(game?.name ?? "Otro juego");
        lines.push(...historicalMetric(name + " · ventas válidas", { count: game?.count, amount: game?.amount }));
      }
    }
    lines.push(...historicalMetric("Otros juegos · premios pagados", ticket.otherGamesPrizes));
    lines.push(...historicalMetric("Otros juegos · total", ticket.totalOtherGames));
    lines.push(...historicalMetric("Premios pagados · total del ticket", ticket.totalPrizes));
    lines.push(...historicalMetric("Total general del ticket", ticket.generalTotal));
    if (ticket.digital && typeof ticket.digital === "object") {
      for (const [key, metric] of Object.entries(ticket.digital)) {
        lines.push(...historicalMetric("Medios digitales · " + key, metric));
      }
    }
    const rawText = String(ticket.rawText ?? "").trim();
    if (rawText) {
      lines.push("Texto OCR original:");
      lines.push(rawText.slice(0, 12000));
      if (rawText.length > 12000) lines.push("[Texto OCR recortado para mantener el respaldo legible.]");
    }
  });
  return lines;
}

async function queueHistoricalRenditionBackups(
  admin: any,
  organizationId: string,
  userId: string,
) {
  const { data: ownerMembership, error: membershipError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || ownerMembership?.role !== "owner") {
    return reply({ error: "historical_backup_owner_only" }, 403);
  }

  const [{ data: backupSettings, error: settingsError }, { data: organization, error: organizationError }] = await Promise.all([
    admin.from("organization_backup_settings")
      .select("recipient_email,enabled,include_ticket_photo")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    admin.from("organizations")
      .select("name,timezone")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  if (settingsError || organizationError || !organization) {
    return reply({ error: "historical_backup_settings_lookup_failed" }, 500);
  }

  let recipient = backupSettings?.enabled
    ? String(backupSettings.recipient_email ?? "").trim()
    : "";

  if (!recipient) {
    const { data: owners, error: ownersError } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1);
    if (ownersError || !owners?.[0]?.user_id) {
      return reply({ error: "historical_backup_recipient_missing" }, 409);
    }
    const { data: ownerUser, error: ownerUserError } = await admin.auth.admin
      .getUserById(String(owners[0].user_id));
    recipient = String(ownerUser?.user?.email ?? "").trim();
    if (ownerUserError || !recipient) {
      return reply({ error: "historical_backup_recipient_missing" }, 409);
    }
  }

  const { data: renditions, error: renditionsError } = await admin
    .from("agency_renditions")
    .select("id,organization_id,agent_id,rendition_date,created_at,game_period,draw_number,capture_method,amount_due,status,reference,notes,agency_agents(id,kind,code,full_name),agency_rendition_game_amounts(amount,commission_percent,commission_amount,agency_game_types(name)),agency_rendition_tickets(ticket_number,ticket_qr_payload)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (renditionsError) {
    return reply({ error: "historical_backup_renditions_lookup_failed" }, 500);
  }

  if ((renditions ?? []).length >= 1000) {
    return reply({ error: "historical_backup_history_limit_reached" }, 409);
  }

  if (!renditions?.length) {
    return reply({ status: "no_historical_renditions", queued: 0, skipped: 0 });
  }

  const renditionIds = renditions.map((row: any) => String(row.id));
  const { data: existingRows, error: existingError } = await admin
    .from("agency_rendition_backup_outbox")
    .select("rendition_id, subject")
    .eq("organization_id", organizationId)
    .in("rendition_id", renditionIds)
    .like("subject", `${HISTORICAL_BACKUP_SUBJECT_PREFIX}%`);

  if (existingError) {
    return reply({ error: "historical_backup_outbox_lookup_failed" }, 500);
  }

  const alreadyBackedUp = new Set(
    (existingRows ?? []).map((row: any) => String(row.rendition_id)),
  );
  const missing = renditions.filter((row: any) => !alreadyBackedUp.has(String(row.id)));

  if (!missing.length) {
    return reply({
      status: "historical_backups_already_generated",
      queued: 0,
      skipped: renditions.length,
    });
  }

  const pendingBackups: Record<string, unknown>[] = [];
  for (const rendition of missing as any[]) {
    const agent = relationOne(rendition.agency_agents) as any;
    const gameRows = Array.isArray(rendition.agency_rendition_game_amounts)
      ? rendition.agency_rendition_game_amounts
      : [];
    const gameLines = gameRows.map((gameRow: any) => {
      const game = relationOne(gameRow.agency_game_types) as any;
      const amount = Number(gameRow.amount ?? 0);
      const commission = Number(gameRow.commission_amount ?? 0);
      const percent = Number(gameRow.commission_percent ?? 0);
      return "- " + String(game?.name ?? "Juego") + ": vendido $ " + formatBackupAmount(amount) +
        " · comisión " + formatBackupAmount(percent) + "% ($ " + formatBackupAmount(commission) +
        ") · neto $ " + formatBackupAmount(amount - commission);
    });
    const ticketRows = Array.isArray(rendition.agency_rendition_tickets)
      ? rendition.agency_rendition_tickets
      : [];
    const ticketLines = ticketRows.map((ticket: any) =>
      "- " + String(ticket.ticket_number ?? "—") +
      (ticket.ticket_qr_payload ? "\n  QR: " + String(ticket.ticket_qr_payload) : "")
    );
    const status = String(rendition.status ?? "");
    const agentType = agent?.kind === "ambulant" ? "Ambulante" : "Subagente";
    const subject = HISTORICAL_BACKUP_SUBJECT_PREFIX + "Backup rendición " +
      String(agent?.code ?? "sin código") + " - " + String(rendition.rendition_date ?? "") +
      " - revisión histórica";
    const textBody = [
      "COPIA HISTÓRICA GENERADA A PEDIDO DEL TITULAR.",
      "Quedará pendiente para envío manual y no se incluirá en el envío automático.",
      "Estado: " + (status === "void" ? "ANULADA" : status.toUpperCase()),
      "Agencia: " + String(organization.name ?? "Agencia"),
      "Tipo: " + agentType,
      "Código: " + String(agent?.code ?? "—"),
      "Nombre: " + String(agent?.full_name ?? "—"),
      "Fecha del juego: " + String(rendition.rendition_date ?? "—"),
      "Registrada: " + String(rendition.created_at ?? "—"),
      "Período/turno: " + String(rendition.game_period ?? "—"),
      "Número de sorteo: " + String(rendition.draw_number ?? "—"),
      "Método: " + String(rendition.capture_method ?? "manual"),
      "Referencia: " + String(rendition.reference ?? "—"),
      "",
      "DETALLE POR JUEGO",
      gameLines.length ? gameLines.join("\n") : "(sin desglose por juego)",
      "",
      "TOTAL VENDIDO: $ " + formatBackupAmount(rendition.amount_due),
      "TOTAL COMISIÓN: $ " + formatBackupAmount(gameRows.reduce((sum: number, row: any) => sum + Number(row.commission_amount ?? 0), 0)),
      "NETO ESTIMADO: $ " + formatBackupAmount(Number(rendition.amount_due ?? 0) - gameRows.reduce((sum: number, row: any) => sum + Number(row.commission_amount ?? 0), 0)),
      "",
      "TICKETS / CUPONES",
      ticketLines.length ? ticketLines.join("\n") : "(sin tickets cargados)",
      "",
      "LECTURA OCR DEL TICKET",
      historicalReceiptLines(rendition.ticket_receipt_data).length
        ? historicalReceiptLines(rendition.ticket_receipt_data).join("\n")
        : "(sin datos OCR guardados para esta rendición)",
      "",
      "OBSERVACIONES / MOTIVO: " + String(rendition.notes ?? "—"),
      "ID DE RENDICIÓN: " + String(rendition.id),
    ].join("\n");

    let ticketPhotoPath: string | null = null;
    if (backupSettings?.include_ticket_photo !== false) {
      const { data: files } = await admin.storage
        .from("agency-rendition-tickets")
        .list(organizationId + "/" + String(rendition.id), { limit: 100 });
      const latestFile = (files ?? [])
        .filter((file: any) => file.id)
        .sort((left: any, right: any) =>
          Date.parse(String(right.created_at ?? "")) - Date.parse(String(left.created_at ?? ""))
        )[0];
      if (latestFile?.name) {
        ticketPhotoPath = organizationId + "/" + String(rendition.id) + "/" + latestFile.name;
      }
    }

    pendingBackups.push({
      organization_id: organizationId,
      rendition_id: String(rendition.id),
      revision_no: 1,
      recipient_email: recipient,
      subject,
      text_body: textBody,
      ...(ticketPhotoPath ? { ticket_photo_path: ticketPhotoPath } : {}),
    });
  }

  const { data: insertedRows, error: insertError } = await admin
    .from("agency_rendition_backup_outbox")
    .upsert(pendingBackups, {
      onConflict: "rendition_id,revision_no",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insertError) {
    return reply({ error: "historical_backup_queue_failed" }, 500);
  }

  return reply({
    status: "historical_backups_queued",
    queued: insertedRows?.length ?? 0,
    skipped: alreadyBackedUp.size,
  });
}

async function matchesDailyCloseSecret(candidate: string): Promise<boolean> {
  if (!candidate) return false;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(candidate),
  );

  const value = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

  return value === DAILY_CLOSE_CRON_SECRET_SHA256;
}

function agencyDateInfo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AGENCY_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value ?? "00";

  return {
    isoDay:
      part("year") + "-" + part("month") + "-" + part("day"),
    displayDay:
      part("day") + "/" + part("month") + "/" + part("year"),
    timestamp:
      part("day") + "/" + part("month") + "/" + part("year") +
      " " + part("hour") + ":" + part("minute") + ":" +
      part("second") + " (Buenos Aires, Argentina)",
  };
}

function normalizeBackupText(rawText: string): string {
  return rawText
    // Las copias antiguas pueden guardar saltos de línea como texto literal.
    .replace(/\\+r\\+n/g, "\n")
    .replace(/\\+n/g, "\n")
    .replace(/\r\n?/g, "\n");
}
function formatDailyBackupItem(rawText: string, createdAt: string): string {
  let normalized = normalizeBackupText(rawText);

  normalized = normalized.replace(
    /Fecha del juego: (\d{4})-(\d{2})-(\d{2})/g,
    (_match, year, month, day) =>
      "Fecha del juego: " + day + "/" + month + "/" + year,
  );

  const date = new Date(createdAt);

  if (!Number.isNaN(date.getTime())) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: AGENCY_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);

    const part = (name: string) =>
      parts.find((item) => item.type === name)?.value ?? "00";

    const stamp =
      part("day") + "/" + part("month") + "/" + part("year") +
      " " + part("hour") + ":" + part("minute") + ":" +
      part("second") + " (Buenos Aires, Argentina)";

    normalized = normalized.replace(
      /Registrada: [^\n\r]+/,
      "Registrada: " + stamp,
    );
  }

  return normalized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBackupHtml(text: string): string {
  const lines = normalizeBackupText(text).trim().split("\n").map((line) => line.trim());
  let html =
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f0eee8;font-family:Arial,Helvetica,sans-serif;color:#30272a;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f0eee8;"><tr><td align="center" style="padding:20px 8px;">' +
    '<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:100%;max-width:680px;border-collapse:collapse;background:#ffffff;">' +
    '<tr><td style="height:7px;background:#ffdf00;font-size:0;">&nbsp;</td></tr>' +
    '<tr><td style="padding:20px 22px;background:#6b283b;color:#ffffff;">' +
    '<div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#ffdf00;font-weight:800;">Agencias Corrientes</div>' +
    '<div style="font-size:23px;line-height:1.25;font-weight:800;margin-top:6px;">Respaldo de rendiciones</div>' +
    '<div style="font-size:12px;line-height:1.5;color:#f3e5e9;margin-top:6px;">Copia para control y consulta</div>' +
    '</td></tr><tr><td style="padding:18px 16px 10px;">' +
    '<div style="font-size:12px;line-height:1.6;color:#6f655b;margin-bottom:12px;">El detalle se organiza por rendición, con importes y observaciones destacados.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;"><tr>';

  let inSummary = true;
  let inRendition = false;
  let number = 0;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("BACKUP DIARIO DE RENDICIONES") || line.startsWith("BACKUP DE RENDICIÓN -")) continue;

    if (line.startsWith("Fecha del cierre:") || line.startsWith("Generado:") || line.startsWith("Cantidad de rendiciones incluidas:")) {
      const split = line.indexOf(":");
      const label = split >= 0 ? line.slice(0, split) : "Resumen";
      const value = split >= 0 ? line.slice(split + 1).trim() : line;
      html += '<td width="33.33%" valign="top" style="padding:10px;border:1px solid #e6d9bd;background:#faf6e9;">' +
        '<div style="font-size:10px;line-height:1.35;letter-spacing:.5px;text-transform:uppercase;color:#827668;margin-bottom:5px;">' +
        escapeHtml(label) + '</div><div style="font-size:13px;line-height:1.4;font-weight:800;color:#6b283b;overflow-wrap:anywhere;">' +
        escapeHtml(value) + '</div></td>';
      continue;
    }

    if (line.startsWith("========== RENDICIÓN ")) {
      if (inSummary) {
        html += '</tr></table>';
        inSummary = false;
      }
      if (inRendition) html += '</td></tr></table>';
      number++;
      const sectionTitle = line.replace(/^=+|=+$/g, "").trim();
      html += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;border:1px solid #e5dac8;">' +
        '<tr><td style="padding:13px 16px;background:#6b283b;color:#ffffff;font-size:16px;font-weight:800;">' +
        escapeHtml(sectionTitle || ("Rendición " + number)) +
        '</td></tr><tr><td style="padding:13px 14px;background:#ffffff;">';
      inRendition = true;
      continue;
    }

    if (line === "DETALLE POR JUEGO" || line === "TICKETS / CUPONES" || line === "OBSERVACIONES / MOTIVO") {
      html += '<div style="margin:16px 0 7px;padding-bottom:6px;border-bottom:1px solid #e8dfd1;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:#6b283b;">' +
        escapeHtml(line === "OBSERVACIONES / MOTIVO" ? "Observaciones" : line) + '</div>';
      continue;
    }

    if (/^- /.test(line)) {
      const detail = line.slice(2);
      const game = detail.match(/^(.*?): venta (.*?) · comisión (.*?) · neto (.*)$/);
      if (game) {
        html += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:5px 0;background:#faf8f2;"><tr>' +
          '<td style="padding:9px;border-bottom:1px solid #e8dfd1;font-size:12px;color:#30272a;">' + escapeHtml(game[1]) +
          '<div style="font-size:10px;color:#827668;margin-top:4px;">Comisión ' + escapeHtml(game[3]) + '</div></td>' +
          '<td align="right" valign="middle" style="padding:9px;border-bottom:1px solid #e8dfd1;font-size:12px;font-weight:800;white-space:nowrap;color:#30272a;">' + escapeHtml(game[2]) +
          '<div style="font-size:10px;color:#6b283b;margin-top:4px;">Neto ' + escapeHtml(game[4]) + '</div></td>' +
          '</tr></table>';
      } else {
        html += '<div style="padding:8px 10px;margin:4px 0;background:#faf8f2;border-left:3px solid #c4a453;font-size:12px;line-height:1.5;">' + escapeHtml(detail) + '</div>';
      }
      continue;
    }

    if (line.startsWith("TOTAL VENDIDO:") || line.startsWith("TOTAL COMISIÓN:") || line.startsWith("NETO ESTIMADO:")) {
      const idx = line.indexOf(":");
      const label = line.slice(0, idx);
      const value = line.slice(idx + 1).trim();
      const net = label === "NETO ESTIMADO";
      html += '<div style="display:block;margin:6px 0;padding:11px 12px;background:' + (net ? "#f5ebd1" : "#f8f6f0") +
        ';border-left:4px solid ' + (net ? "#6b283b" : "#c1a356") + ';font-size:12px;line-height:1.4;color:#30272a;">' +
        '<span style="font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#766958;">' + escapeHtml(label) +
        '</span><div style="font-size:17px;font-weight:800;color:' + (net ? "#6b283b" : "#30272a") + ';margin-top:3px;">' +
        escapeHtml(value) + '</div></div>';
      continue;
    }

    if (line.startsWith("ID DE RENDICIÓN:")) {
      const idx = line.indexOf(":");
      html += '<div style="padding-top:10px;margin-top:12px;border-top:1px solid #eee8dc;font-size:10px;line-height:1.5;color:#958878;overflow-wrap:anywhere;">' +
        escapeHtml(line.slice(0, idx)) + ': ' + escapeHtml(line.slice(idx + 1).trim()) + '</div>';
      continue;
    }

    const idx = line.indexOf(":");
    if (idx > 0 && idx < 38) {
      html += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>' +
        '<td width="38%" valign="top" style="padding:7px 8px;border-bottom:1px solid #f0eade;font-size:11px;color:#827668;">' + escapeHtml(line.slice(0, idx)) + '</td>' +
        '<td valign="top" style="padding:7px 8px;border-bottom:1px solid #f0eade;font-size:12px;font-weight:700;line-height:1.45;color:#30272a;overflow-wrap:anywhere;">' + escapeHtml(line.slice(idx + 1).trim() || "—") + '</td>' +
        '</tr></table>';
    } else {
      html += '<div style="padding:5px 2px;font-size:12px;line-height:1.6;color:#827668;">' + escapeHtml(line) + '</div>';
    }
  }

  if (inSummary) html += '</tr></table>';
  if (inRendition) html += '</td></tr></table>';
  html += '<div style="padding:13px 8px 10px;border-top:1px solid #e8dfd1;color:#8c8071;font-size:10px;line-height:1.6;">Mensaje automático de respaldo de Agencias Corrientes. Conservá este correo para consulta y control de caja.</div>' +
    '</td></tr><tr><td style="height:6px;background:#6b283b;font-size:0;">&nbsp;</td></tr></table></td></tr></table></body></html>';
  return html;
}

async function sendBackupThroughAppsScript(
  scriptUrl: string,
  token: string,
  payload: {
    to: string;
    subject: string;
    text: string;
    html: string;
    attachments: { filename: string; content: string }[];
  },
): Promise<void> {
  let response = await fetch(scriptUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ secret: token, ...payload }),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });

  let redirectHops = 0;
  while ([301, 302, 303, 307, 308].includes(response.status) && redirectHops < 5) {
    const location = response.headers.get("location");
    if (!location) break;

    const nextUrl = new URL(location, scriptUrl);
    if (
      nextUrl.origin === new URL(scriptUrl).origin &&
      nextUrl.pathname.includes("/macros/s/") &&
      nextUrl.pathname.endsWith("/exec")
    ) {
      break;
    }

    redirectHops++;
    response = await fetch(nextUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
  }

  let result: { ok?: boolean; error?: string } = {};
  try {
    result = await response.json();
  } catch {
    // No guardamos el cuerpo del proveedor: puede incluir datos del correo.
  }

  if (!response.ok || result.ok !== true) {
    const detail = typeof result.error === "string" ? result.error : "respuesta inválida";
    throw new Error(
      "Apps Script no confirmó el envío (HTTP " + response.status + ", " + detail + ").",
    );
  }
}

async function sendDailyCloseBackups(
  admin: any,
  googleAppsScriptUrl: string | undefined,
  googleAppsScriptToken: string | undefined,
  organizationIdFilter?: string,
  onlyRenditionId?: string,
  scheduledOnly = false,
) {
  if (!googleAppsScriptUrl || !googleAppsScriptToken) {
    return reply({
      error: "email_provider_not_configured",
      message: "Configure GOOGLE_APPS_SCRIPT_URL y GOOGLE_APPS_SCRIPT_TOKEN en los secretos de Supabase.",
    }, 503);
  }

  const now = new Date();
  const dateInfo = agencyDateInfo(now);

  let outboxQuery = admin
    .from("agency_rendition_backup_outbox")
    .select("*")
    .order("created_at", { ascending: false });
  if (organizationIdFilter) {
    outboxQuery = outboxQuery.eq("organization_id", organizationIdFilter);
  }
  const { data: allRows, error: lookupError } = await outboxQuery.limit(10000);

  if (lookupError) {
    return reply({ error: "daily_backup_lookup_failed" }, 500);
  }

  if ((allRows ?? []).length >= 10000) {
    return reply({
      error: "daily_backup_history_limit_reached",
      message: "Se alcanzó el límite de lectura; no se envió una copia parcial.",
    }, 500);
  }

  // Mantiene solo la revisión más reciente de cada rendición.
  const latestByRendition = new Map<string, any>();

  for (const row of allRows ?? []) {
    const key = String(row.rendition_id);
    const previous = latestByRendition.get(key);

    if (
      !previous ||
      Number(row.revision_no ?? 1) > Number(previous.revision_no ?? 1)
    ) {
      latestByRendition.set(key, row);
    }
  }

  const retryBefore = now.getTime() - 20 * 60 * 1000;

  const pendingRows = Array.from(latestByRendition.values())
    .filter((row) => {
      if (onlyRenditionId && String(row.rendition_id) !== onlyRenditionId) return false;
      if (scheduledOnly && String(row.subject ?? "").startsWith(HISTORICAL_BACKUP_SUBJECT_PREFIX)) {
        return false;
      }
      if (row.status === "pending" || row.status === "failed") {
        return true;
      }

      return row.status === "sending" &&
        Date.parse(String(row.last_attempt_at ?? row.created_at ?? "")) <
          retryBefore;
    })
    .sort(
      (a, b) =>
        Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)),
    );

  if (!pendingRows.length) {
    return reply({
      status: "nothing_to_send",
      date: dateInfo.displayDay,
      renditions: 0,
    });
  }

  const renditionIds = Array.from(
    new Set(pendingRows.map((row) => String(row.rendition_id))),
  );

  const { data: renditionMetadata, error: renditionMetadataError } =
    await admin
      .from("agency_renditions")
      .select("id,created_at,rendition_date")
      .in("id", renditionIds);

  if (renditionMetadataError) {
    return reply({
      error: "daily_backup_rendition_metadata_failed",
    }, 500);
  }

  const renditionMetadataById = new Map(
    (renditionMetadata ?? []).map((row: any) => [String(row.id), row]),
  );

  // Cada agencia conserva su propio lote y destinatario.
  const batches = new Map<string, any[]>();

  for (const row of pendingRows) {
    const key = String(row.organization_id);
    batches.set(key, [...(batches.get(key) ?? []), row]);
  }

  const results: {
    organization_id: string;
    renditions: number;
    status: string;
    error?: string;
  }[] = [];

  for (const [organizationId, rows] of batches) {
    const claimed: any[] = [];

    for (const row of rows) {
      const { data, error } = await admin
        .from("agency_rendition_backup_outbox")
        .update({
          status: "sending",
          attempt_count: Number(row.attempt_count ?? 0) + 1,
          last_attempt_at: now.toISOString(),
          last_error: null,
        })
        .eq("id", row.id)
        .eq("status", row.status)
        .select("*")
        .maybeSingle();

      if (!error && data) claimed.push(data);
    }

    if (!claimed.length) continue;

    claimed.sort(
      (a, b) =>
        Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)),
    );

    const recipient = String(
      claimed[claimed.length - 1].recipient_email ?? "",
    ).trim();

    if (!recipient) {
      await admin
        .from("agency_rendition_backup_outbox")
        .update({
          status: "failed",
          last_error:
            "No hay correo de respaldo configurado para el cierre diario.",
        })
        .in("id", claimed.map((row) => row.id));

      results.push({
        organization_id: organizationId,
        renditions: claimed.length,
        status: "failed_no_recipient",
      });

      continue;
    }

    const sections = claimed.map(
      (row, index) =>
        "========== RENDICIÓN " + (index + 1) + " DE " +
        claimed.length + " ==========\n" +
        formatDailyBackupItem(
          String(row.text_body ?? "(sin detalle de respaldo)"),
          String(
            renditionMetadataById.get(String(row.rendition_id))?.created_at ??
              row.created_at ??
              now.toISOString(),
          ),
        ),
    );

    let textBody =
      "BACKUP DIARIO DE RENDICIONES - AGENCIAS CORRIENTES\n" +
      "Fecha del cierre: " + dateInfo.displayDay + "\n" +
      "Generado: " + dateInfo.timestamp + "\n" +
      "Cantidad de rendiciones incluidas: " + claimed.length + "\n\n" +
      sections.join("\n\n");

    const attachments: { filename: string; content: string }[] = [];
    let totalAttachmentBytes = 0;
    let omittedPhotos = 0;

    const maxAttachmentBytes = 15 * 1024 * 1024;

    for (let index = 0; index < claimed.length; index++) {
      const row = claimed[index];

      if (!row.ticket_photo_path) continue;

      const { data: photoData, error: photoError } = await admin.storage
        .from("agency-rendition-tickets")
        .download(row.ticket_photo_path);

      if (photoError || !photoData) {
        omittedPhotos++;
        continue;
      }

      try {
        const bytes = new Uint8Array(await photoData.arrayBuffer());

        if (totalAttachmentBytes + bytes.length > maxAttachmentBytes) {
          omittedPhotos++;
          continue;
        }

        let binary = "";

        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
          );
        }

        const path = String(row.ticket_photo_path);

        const extension = path.endsWith(".png")
          ? "png"
          : path.endsWith(".webp")
          ? "webp"
          : "jpg";

        attachments.push({
          filename: "ticket-rendicion-" + (index + 1) + "." + extension,
          content: btoa(binary),
        });

        totalAttachmentBytes += bytes.length;
      } catch {
        omittedPhotos++;
      }
    }

    if (omittedPhotos) {
      textBody +=
        "\n\nNOTA: " + omittedPhotos +
        " foto(s) no se adjuntaron por no estar disponibles o superar el " +
        "límite de adjuntos. Los datos de las rendiciones están incluidos.";
    }

    try {
      await sendBackupThroughAppsScript(googleAppsScriptUrl, googleAppsScriptToken, {
        to: recipient,
        subject: "Backup diario de rendiciones - " + dateInfo.displayDay,
        text: textBody,
        html: formatBackupHtml(textBody),
        attachments,
      });
    } catch (cause) {
      const reason = cause instanceof Error
        ? cause.message
        : "No se pudo conectar con Apps Script.";
      await admin
        .from("agency_rendition_backup_outbox")
        .update({ status: "failed", last_error: String(reason).slice(0, 1000) })
        .in("id", claimed.map((row) => row.id));
      results.push({
        organization_id: organizationId,
        renditions: claimed.length,
        status: "failed",
        error: String(reason).slice(0, 500),
      });
      continue;
    }

    const { error: markSentError } = await admin
      .from("agency_rendition_backup_outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .in("id", claimed.map((row) => row.id));

    results.push({
      organization_id: organizationId,
      renditions: claimed.length,
      status: markSentError ? "sent_status_update_failed" : "sent",
    });
  }

  if (onlyRenditionId) {
    const result = results.find((item) => item.organization_id === organizationIdFilter);
    return reply({
      status: result?.status === "sent" ? "sent" : result?.status ?? "failed",
      date: dateInfo.displayDay,
      renditions: result?.renditions ?? 0,
      error: result?.error,
    });
  }

  return reply({
    status: "daily_close_processed",
    date: dateInfo.displayDay,
    batches: results,
  });
}


async function sendScheduledDailyBackups(
  admin: any,
  googleAppsScriptUrl: string | undefined,
  googleAppsScriptToken: string | undefined,
) {
  const now = new Date();
  const currentTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: AGENCY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  const { data: backupSettings, error: backupSettingsError } = await admin
    .from("organization_backup_settings")
    .select("organization_id,recipient_email")
    .eq("enabled", true)
    .not("recipient_email", "is", null);

  if (backupSettingsError) {
    return reply({ error: "scheduled_backup_settings_lookup_failed" }, 500);
  }

  const organizationIds = Array.from(new Set(
    (backupSettings ?? [])
      .filter((row: any) => String(row.recipient_email ?? "").trim())
      .map((row: any) => String(row.organization_id)),
  ));

  if (!organizationIds.length) {
    return reply({ status: "no_backup_recipients", time: currentTime, batches: [] });
  }

  const { data: operationalSettings, error: operationalSettingsError } = await admin
    .from("agency_operational_settings")
    .select("organization_id,backup_send_time")
    .in("organization_id", organizationIds);

  if (operationalSettingsError) {
    return reply({ error: "scheduled_backup_times_lookup_failed" }, 500);
  }

  const scheduleByOrganization = new Map<string, string>();
  for (const setting of operationalSettings ?? []) {
    scheduleByOrganization.set(
      String(setting.organization_id),
      String(setting.backup_send_time ?? "23:50").slice(0, 5),
    );
  }

  // Mantiene 23:50 como horario predeterminado para una organización sin configuración guardada.
  const dueOrganizations = organizationIds.filter(
    (organizationId) => (scheduleByOrganization.get(organizationId) ?? "23:50") === currentTime,
  );

  if (!dueOrganizations.length) {
    return reply({
      status: "not_scheduled_time",
      time: currentTime,
      batches: [],
    });
  }

  const batches: Array<Record<string, unknown>> = [];
  for (const organizationId of dueOrganizations) {
    const response = await sendDailyCloseBackups(
      admin,
      googleAppsScriptUrl,
      googleAppsScriptToken,
      organizationId,
      undefined,
      true,
    );

    let result: Record<string, unknown> = {};
    try {
      result = await response.json();
    } catch {
      result = { status: "invalid_scheduler_response" };
    }

    batches.push({
      organization_id: organizationId,
      http_status: response.status,
      ...result,
    });
  }

  const failed = batches.some((batch) =>
    (typeof batch.http_status === "number" && batch.http_status >= 400) ||
    ["failed", "failed_no_recipient", "invalid_scheduler_response"].includes(String(batch.status ?? "")),
  );

  return reply({
    status: failed ? "daily_close_processed_with_errors" : "daily_close_processed",
    time: currentTime,
    batches,
  }, failed ? 500 : 200);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");

  const googleAppsScriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
  const googleAppsScriptToken = Deno.env.get("GOOGLE_APPS_SCRIPT_TOKEN");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return reply({ error: "supabase_function_secrets_missing" }, 500);
  }

  let payload: {
    outbox_id?: string;
    rendition_id?: string;
    daily_close?: boolean;
    manual_close?: boolean;
    regenerate_historical?: boolean;
    organization_id?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }

  const cronCandidate = request.headers.get("x-cron-secret") ?? "";

  const cronAuthorized =
    payload.daily_close === true &&
    await matchesDailyCloseSecret(cronCandidate);

  if (payload.daily_close === true && !cronAuthorized) {
    return reply({ error: "daily_close_forbidden" }, 403);
  }

  let userId = "";

  if (!cronAuthorized) {
    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return reply({ error: "authentication_required" }, 401);
    }

    const token = authorization.slice("Bearer ".length);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } =
      await userClient.auth.getUser(token);

    if (userError || !userData.user) {
      return reply({ error: "invalid_session" }, 401);
    }

    userId = userData.user.id;
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (cronAuthorized) {
    return await sendScheduledDailyBackups(admin, googleAppsScriptUrl, googleAppsScriptToken);
  }

  if (payload.manual_close === true) {
    const manualOrganizationId = String(payload.organization_id ?? "").trim();
    if (!manualOrganizationId) {
      return reply({ error: "organization_id_required_for_manual_backup" }, 400);
    }

    const { data: ownerMembership, error: ownerMembershipError } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", manualOrganizationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (ownerMembershipError || ownerMembership?.role !== "owner") {
      return reply({ error: "manual_backup_owner_only" }, 403);
    }

    return await sendDailyCloseBackups(
      admin,
      googleAppsScriptUrl,
      googleAppsScriptToken,
      manualOrganizationId,
    );
  }

  if (payload.regenerate_historical === true) {
    const organizationId = String(payload.organization_id ?? "").trim();
    if (!organizationId) {
      return reply({ error: "organization_id_required_for_historical_backup" }, 400);
    }
    return await queueHistoricalRenditionBackups(admin, organizationId, userId);
  }

  if (!payload.outbox_id && !payload.rendition_id) {
    return reply({ error: "outbox_id_or_rendition_id_required" }, 400);
  }

  const outboxQuery = payload.outbox_id
    ? admin
      .from("agency_rendition_backup_outbox")
      .select("*")
      .eq("id", payload.outbox_id)
    : admin
      .from("agency_rendition_backup_outbox")
      .select("*")
      .eq("rendition_id", payload.rendition_id as string)
      .order("revision_no", { ascending: false })
      .limit(1);

  const { data: outbox, error: outboxError } =
    await outboxQuery.maybeSingle();

  if (outboxError) {
    return reply({ error: "backup_lookup_failed" }, 500);
  }

  if (!outbox) {
    return reply({ error: "backup_not_found_or_not_configured" }, 404);
  }

  const { data: member, error: memberError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", outbox.organization_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberError || !member) {
    return reply({ error: "agency_access_denied" }, 403);
  }

  const manager = member.role === "owner";

  if (!manager) {
    return reply({
      error: "owner_only_backup_permission_required",
    }, 403);
  }

  if (outbox.status === "sent") {
    return reply({
      status: "sent",
      already_sent: true,
      sent_at: outbox.sent_at,
    });
  }

  if (!["pending", "failed", "sending"].includes(outbox.status)) {
    return reply({
      error: "backup_is_being_processed",
      status: outbox.status,
    }, 409);
  }

  // El reintento desde Personal envía esta rendición ahora, sin esperar al cierre.
  return await sendDailyCloseBackups(
    admin,
    googleAppsScriptUrl,
    googleAppsScriptToken,
    String(outbox.organization_id),
    String(outbox.rendition_id),
  );
});
