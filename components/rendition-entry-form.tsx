"use client";

import { useMemo, useState } from "react";
import jsQR from "jsqr";
import { createAgencyRendition, updateAgencyRendition } from "@/app/(app)/agencias/actions";

type Game = { id: string; name: string; category: string };
type InitialRendition = {
  id: string;
  renditionDate: string;
  period?: string | null;
  drawNumber?: string | null;
  amounts: Record<string, string>;
  ticketNumbers: string[];
  qrPayload?: string | null;
  reference?: string | null;
  notes?: string | null;
  captureMethod?: string | null;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function parseMoney(value: string): number | null {
  let amount = value.replace(/[^0-9,.-]/g, "");
  if (!amount || !/\d/.test(amount)) return null;
  if (amount.includes(".") && amount.includes(",")) {
    amount = amount.replace(/\./g, "").replace(",", ".");
  } else if (amount.includes(",")) {
    const decimals = amount.length - amount.lastIndexOf(",") - 1;
    amount = decimals > 0 && decimals <= 2
      ? amount.replace(/\./g, "").replace(",", ".")
      : amount.replace(/,/g, "");
  } else if (amount.includes(".")) {
    const chunks = amount.split(".");
    const last = chunks[chunks.length - 1] ?? "";
    amount = last.length === 3 ? chunks.join("") : chunks.slice(0, -1).join("") + "." + last;
  }
  const parsed = Number(amount);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function amountsFromLine(line: string) {
  const candidates = line.match(/(?:ARS\s*)?\$?\s*\d[\d.,]*(?:\s*(?:ARS|PESOS))?/gi) ?? [];
  return candidates.map(parseMoney).filter((amount): amount is number => amount !== null);
}

function aliasesFor(game: Game) {
  const name = normalize(game.name);
  if (name.includes("POCEADA")) return ["QUINIELA POCEADA", "POCEADA"];
  if (name.includes("LOTO 5")) return ["LOTO 5", "LOTO5"];
  if (name.includes("LOTO PLUS EXTRA")) return ["LOTO PLUS EXTRA"];
  if (name.includes("LOTO PLUS")) return ["LOTO PLUS"];
  if (name.includes("QUINI 6") || name.includes("QUINI6")) return ["QUINI 6", "QUINI6"];
  if (name.includes("TELEKINO")) return ["TELEKINO"];
  if (name.includes("BRINCO")) return ["BRINCO"];
  if (name.includes("LA PREVIA")) return ["LA PREVIA", "PREVIA"];
  if (name.includes("MATUTINA")) return ["MATUTINA"];
  if (name.includes("VESPERTINA")) return ["VESPERTINA"];
  if (name.includes("NOCTURNA")) return ["NOCTURNA"];
  if (name.includes("PRIMERA")) return ["EL PRIMERO", "PRIMERA"];
  if (name.includes("AL TOQUE")) return ["AL TOQUE"];
  if (name === "QUINIELA") return ["QUINIELA"];
  return [name];
}

function parseTicketText(text: string, games: Game[]) {
  const normalText = normalize(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const normalizedLines = lines.map(normalize);
  const amountMap: Record<string, string> = {};
  const matchedGames = games.filter((game) => aliasesFor(game).some((alias) => normalText.includes(alias)));

  for (const game of games) {
    const aliases = aliasesFor(game);
    for (let index = 0; index < normalizedLines.length; index += 1) {
      if (!aliases.some((alias) => normalizedLines[index]?.includes(alias))) continue;
      const sameLineAmount = amountsFromLine(lines[index] ?? "").at(-1);
      const nextLineAmount = amountsFromLine(lines[index + 1] ?? "").at(-1);
      const amount = sameLineAmount ?? nextLineAmount;
      if (amount) {
        amountMap[game.id] = amount.toFixed(2);
        break;
      }
    }
  }

  const totalLineAmounts = lines
    .filter((line) => /\b(TOTAL|IMPORTE|MONTO|APUESTA TOTAL|TOTAL JUGADA|VALOR TOTAL)\b/i.test(normalize(line)))
    .flatMap(amountsFromLine);
  const ticketTotal = totalLineAmounts.at(-1);
  if (matchedGames.length === 1 && ticketTotal && !amountMap[matchedGames[0]!.id]) {
    amountMap[matchedGames[0]!.id] = ticketTotal.toFixed(2);
  }

  const dateMatch = text.match(/\b(\d{2})[\/-](\d{2})[\/-](20\d{2}|\d{2})\b/);
  let date: string | null = null;
  if (dateMatch) {
    const day = dateMatch[1]!;
    const month = dateMatch[2]!;
    const year = dateMatch[3]!.length === 2 ? "20" + dateMatch[3] : dateMatch[3]!;
    date = year + "-" + month + "-" + day;
  }

  const drawMatch = normalText.match(/\bSORTEO\s*(?:NRO|NUMERO|N|#)?\s*[:.°º-]?\s*(\d{3,7})\b/);
  const periodOptions = [
    ["LA PREVIA", "La Previa"],
    ["EL PRIMERO", "Primera"],
    ["PRIMERA", "Primera"],
    ["MATUTINA", "Matutina"],
    ["VESPERTINA", "Vespertina"],
    ["NOCTURNA", "Nocturna"],
  ];
  const detectedPeriod = periodOptions.find(([label]) => normalText.includes(label))?.[1] ?? "";
  const ticketMatch = normalText.match(/\b(?:CUPON|TICKET|TKT|COMPROBANTE)\s*(?:NRO|N|#|:)?\s*([A-Z0-9-]{6,24})\b/);

  return {
    amountMap,
    date,
    period: detectedPeriod,
    drawNumber: drawMatch?.[1] ?? "",
    ticketNumber: ticketMatch?.[1] ?? "",
    detectedGames: matchedGames.map((game) => game.name),
  };
}

async function readQrFromImage(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / bitmap.width, 1800 / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const decoded = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
  return decoded?.data?.trim() || null;
}

function structuredQr(payload: string) {
  const blank = { amount: null as number | null, date: null as string | null, period: "", drawNumber: "", ticketNumber: "", game: "" };
  const normalizeDate = (value: string): string | null => {
    if (value.length === 10 && value[4] === "-" && value[7] === "-") return value;
    const parts = value.split("/");
    if (parts.length === 3 && parts[0]?.length <= 2 && parts[1]?.length <= 2) {
      const year = parts[2]?.length === 2 ? "20" + parts[2] : parts[2] ?? "";
      return year.length === 4 ? year + "-" + (parts[1] ?? "").padStart(2, "0") + "-" + (parts[0] ?? "").padStart(2, "0") : null;
    }
    return null;
  };
  const readFields = (get: (key: string) => string | null) => {
    const amountRaw = get("amount") ?? get("importe") ?? get("monto") ?? get("total");
    const amount = amountRaw ? parseMoney(amountRaw) : null;
    const dateRaw = get("date") ?? get("fecha") ?? "";
    return {
      amount,
      date: normalizeDate(dateRaw),
      period: get("period") ?? get("periodo") ?? get("turno") ?? "",
      drawNumber: get("draw_number") ?? get("sorteo") ?? get("nro_sorteo") ?? "",
      ticketNumber: get("ticket") ?? get("ticket_number") ?? get("cupon") ?? get("id") ?? "",
      game: get("game") ?? get("juego") ?? "",
    };
  };
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return readFields((key) => parsed[key] == null ? null : String(parsed[key]));
  } catch {
    try {
      const url = new URL(payload);
      const query = url.searchParams;
      const fields = readFields((key) => query.get(key));
      if (!fields.ticketNumber && url.pathname.split("/").filter(Boolean).length) {
        fields.ticketNumber = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
      }
      return fields;
    } catch {
      return blank;
    }
  }
}

export function RenditionEntryForm({ agentId, games, today, initialRendition }: { agentId: string; games: Game[]; today: string; initialRendition?: InitialRendition }) {
  const [mode, setMode] = useState<"photo" | "manual">(initialRendition?.captureMethod === "manual" ? "manual" : "photo");
  const [date, setDate] = useState(initialRendition?.renditionDate ?? today);
  const [period, setPeriod] = useState(initialRendition?.period ?? "");
  const [drawNumber, setDrawNumber] = useState(initialRendition?.drawNumber ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>(initialRendition?.amounts ?? {});
  const [ticketNumbers, setTicketNumbers] = useState((initialRendition?.ticketNumbers ?? []).join("\n"));
  const [qrPayload, setQrPayload] = useState(initialRendition?.qrPayload ?? "");
  const [reference, setReference] = useState(initialRendition?.reference ?? "");
  const [notes, setNotes] = useState(initialRendition?.notes ?? "");
  const [ocrText, setOcrText] = useState("");
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const total = useMemo(() =>
    Object.values(amounts).reduce((sum, value) => sum + (Number(value) > 0 ? Number(value) : 0), 0),
    [amounts]
  );

  async function processTicket(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    setFileName(file.name);
    setOcrText("");
    let detectedQr = "";
    try {
      setProgress("Buscando el QR del ticket...");
      detectedQr = (await readQrFromImage(file)) ?? "";
      if (detectedQr) {
        setQrPayload(detectedQr);
        const qr = structuredQr(detectedQr);
        if (qr.date) setDate(qr.date);
        if (qr.period) setPeriod(qr.period);
        if (qr.drawNumber) setDrawNumber(qr.drawNumber);
        if (qr.ticketNumber) setTicketNumbers((previous) => previous ? previous + "\n" + qr.ticketNumber : qr.ticketNumber);
        if (qr.amount && qr.game) {
          const normalizedGame = normalize(qr.game);
          const target = games.find((game) => aliasesFor(game).some((alias) => normalizedGame.includes(alias)));
          if (target) setAmounts((previous) => ({ ...previous, [target.id]: qr.amount!.toFixed(2) }));
        }
      }

      setProgress("Leyendo el texto del ticket...");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("spa+eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text" && typeof message.progress === "number") {
            setProgress("Reconociendo ticket: " + Math.round(message.progress * 100) + "%");
          }
        },
      });
      let recognizedText = "";
      try {
        const result = await worker.recognize(file);
        recognizedText = result.data.text ?? "";
      } finally {
        await worker.terminate();
      }

      setOcrText(recognizedText);
      const parsed = parseTicketText(recognizedText, games);
      setAmounts((previous) => ({ ...previous, ...parsed.amountMap }));
      if (parsed.date) setDate(parsed.date);
      if (parsed.period) setPeriod(parsed.period);
      if (parsed.drawNumber) setDrawNumber(parsed.drawNumber);
      if (parsed.ticketNumber && !ticketNumbers.includes(parsed.ticketNumber)) {
        setTicketNumbers((previous) => previous ? previous + "\n" + parsed.ticketNumber : parsed.ticketNumber);
      }
      const qr = detectedQr ? structuredQr(detectedQr) : null;
      if (qr?.amount && parsed.detectedGames.length === 1 && !parsed.amountMap[games.find((game) => game.name === parsed.detectedGames[0])?.id ?? ""]) {
        const target = games.find((game) => game.name === parsed.detectedGames[0]);
        if (target) setAmounts((previous) => ({ ...previous, [target.id]: qr.amount!.toFixed(2) }));
      }

      const recognizedCount = Object.keys(parsed.amountMap).length;
      if (detectedQr && recognizedCount) {
        setNotice("QR e importes detectados. Revisá fecha, período y valores antes de registrar.");
      } else if (detectedQr) {
        setNotice("QR leído. Si el código no contiene los montos, completá lo que falte en la lista.");
      } else if (recognizedCount) {
        setNotice("Ticket leído. Los importes detectados se cargaron como propuesta; revisalos antes de guardar.");
      } else {
        setNotice("Se leyó el texto, pero no se pudieron confirmar importes. Completalos manualmente.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer la foto del ticket.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <form action={initialRendition ? updateAgencyRendition : createAgencyRendition} className="form-stack rendition-entry-form">
      <input type="hidden" name="agent_id" value={agentId} />
      <input type="hidden" name="rendition_id" value={initialRendition?.id ?? ""} />
      <input type="hidden" name="ticket_qr_payload" value={qrPayload} />
      <input type="hidden" name="game_period" value={period} />
      <input type="hidden" name="draw_number" value={drawNumber} />
      <input type="hidden" name="capture_method" value={mode === "manual" ? "manual" : qrPayload ? "qr" : fileName ? "photo" : initialRendition?.captureMethod === "photo" ? "photo" : initialRendition?.captureMethod === "qr" ? "qr" : "manual"} />

      <div className="rendition-mode-switch" role="group" aria-label="Método de carga de rendición">
        <button type="button" className={mode === "photo" ? "active" : ""} onClick={() => setMode("photo")}>Foto / QR (automático)</button>
        <button type="button" className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>Carga manual</button>
      </div>

      {mode === "photo" && (
        <div className="ticket-capture-panel">
          <label className="ticket-photo-picker">
            <span className="ticket-photo-icon" aria-hidden="true">▧</span>
            <strong>Fotografiá el ticket completo</strong>
            <span>Apuntá la cámara del celular al ticket. Se intentará leer el QR y reconocer juego, importe, fecha y período.</span>
            <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void processTicket(file);
            }} />
          </label>
          <p className="muted small-text">También podés subir una foto guardada. La lectura se procesa en el navegador; no se guarda la imagen.</p>
          {fileName && <p className="ticket-file-label">Ticket cargado: <strong>{fileName}</strong></p>}
          {busy && <p className="ticket-read-progress" role="status">{progress}</p>}
          {error && <p className="ticket-read-error" role="alert">{error}</p>}
          {notice && !error && <p className="ticket-read-notice">{notice}</p>}
          {qrPayload && <div className="qr-detected"><strong>✓ QR detectado</strong><code>{qrPayload.slice(0, 100)}{qrPayload.length > 100 ? "…" : ""}</code><button type="button" className="button ghost small" onClick={() => setQrPayload("")}>Quitar QR</button></div>}
          {ocrText && <details className="ticket-ocr-text"><summary>Ver texto reconocido</summary><pre>{ocrText}</pre></details>}
        </div>
      )}

      <div className="detail-grid rendition-meta-grid">
        <label>Fecha del juego<input type="date" name="rendition_date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label>Período / turno<input value={period} onChange={(event) => setPeriod(event.target.value)} placeholder="La Previa, Primera, Matutina..." /></label>
        <label>Número de sorteo<input value={drawNumber} onChange={(event) => setDrawNumber(event.target.value)} placeholder="Se detecta de la foto" /></label>
        <label>Referencia<input name="reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Opcional" /></label>
      </div>

      <div className="game-rendition-block">
        <div className="game-rendition-head"><div><h3>Juegos e importes</h3><p className="muted">{mode === "photo" ? "El lector completa lo que reconoce. Corregí o agregá importes antes de guardar." : "Cargá manualmente los importes por juego."}</p></div><span className="rendition-live-total">{new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(total)}</span></div>
        <div className="game-rendition-list">
          {games.map((game) => <label className="game-rendition-row" key={game.id}><span><strong>{game.name}</strong><small>{game.category}</small></span><input type="number" name={"game_" + game.id} min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={amounts[game.id] ?? ""} onChange={(event) => setAmounts((previous) => ({ ...previous, [game.id]: event.target.value }))} /></label>)}
          {!games.length && <p className="message">No hay juegos activos para cargar la rendición.</p>}
        </div>
      </div>

      <label className="ticket-input-block"><span>Número(s) de ticket / cupón</span><textarea name="ticket_numbers" rows={2} value={ticketNumbers} onChange={(event) => setTicketNumbers(event.target.value)} placeholder="Se completa desde la lectura o ingresalo manualmente." /></label>
      <label className="ticket-input-block"><span>Observaciones</span><textarea name="notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional." /></label>
      <button className="button primary" disabled={!games.length || busy || total <= 0}>{busy ? "Leyendo ticket…" : initialRendition ? "Guardar cambios de la rendición" : "Registrar rendición diaria"}</button>
      <small className="muted">Se guardan fecha y hora de registro, fecha del juego, período, sorteo, importes y el QR leído. La lectura se debe revisar antes de confirmar.</small>
    </form>
  );
}
