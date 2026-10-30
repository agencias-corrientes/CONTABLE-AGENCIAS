"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import jsQR from "jsqr";
import { attachAgencyRenditionTicketReceiptDataToExisting, createAgencyRendition, updateAgencyRendition } from "@/app/(app)/agencias/actions";
import { getGamesForDrawPeriod, OfficialDrawPeriod, resolveRecognizedDrawPeriod } from "@/lib/agency-draw-schedule";
import { extractTicketPeriodNumber, mapTicketClosureAmounts, parseTicketClosure, type TicketClosureData } from "@/lib/agency-ticket-closure";
import { TicketClosureReceipt } from "@/components/ticket-closure-receipt";

type Game = { id: string; name: string; category: string; enabled?: boolean; commissionPercent?: number | null };
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
  receiptData?: TicketClosureData | null;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

let paddleOcrEnginePromise: Promise<any> | null = null;

async function getPaddleOcrEngine(): Promise<any> {
  if (!paddleOcrEnginePromise) {
    paddleOcrEnginePromise = import("@paddleocr/paddleocr-js")
      .then(({ PaddleOCR }) => PaddleOCR.create({
        lang: "es",
        ocrVersion: "PP-OCRv6",
        worker: true,
        ortOptions: {
          backend: "wasm",
          wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/",
          numThreads: 1,
          simd: true,
        },
      }))
      .catch((error) => {
        paddleOcrEnginePromise = null;
        throw error;
      });
  }
  return paddleOcrEnginePromise;
}

function paddleOcrItemsToText(rawItems: unknown): string {
  if (!Array.isArray(rawItems)) return "";
  const entries = rawItems.map((raw: any, index: number) => {
    const text = String(raw?.text ?? "").trim();
    if (!text) return null;
    const points = Array.isArray(raw?.poly) ? raw.poly.map((point: any) => {
      if (Array.isArray(point) && point.length >= 2) return { x: Number(point[0]), y: Number(point[1]) };
      if (point && typeof point === "object") return { x: Number(point.x), y: Number(point.y) };
      return null;
    }).filter((point: any) => point && Number.isFinite(point.x) && Number.isFinite(point.y)) : [];
    if (!points.length) return { text, left: index, centerY: index * 24, height: 18, hasGeometry: false };
    const xs = points.map((point: any) => point.x);
    const ys = points.map((point: any) => point.y);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { text, left: Math.min(...xs), centerY: (top + bottom) / 2, height: Math.max(1, bottom - top), hasGeometry: true };
  }).filter(Boolean) as Array<{text:string;left:number;centerY:number;height:number;hasGeometry:boolean}>;
  if (!entries.length) return "";
  if (!entries.some((entry) => entry.hasGeometry)) return entries.map((entry) => entry.text).join("\n");
  entries.sort((a,b) => a.centerY-b.centerY || a.left-b.left);
  const rows: Array<{centerY:number;height:number;entries:typeof entries}> = [];
  for (const entry of entries) {
    let row = rows.find((candidate) =>
      Math.abs(candidate.centerY-entry.centerY) <= Math.max(8, Math.min(candidate.height,entry.height)*0.65)
    );
    if (!row) {
      row = {centerY:entry.centerY,height:entry.height,entries:[]};
      rows.push(row);
    }
    row.entries.push(entry);
    row.centerY = row.entries.reduce((sum,item)=>sum+item.centerY,0)/row.entries.length;
    row.height = Math.max(row.height,entry.height);
  }
  return rows
    .sort((a,b)=>a.centerY-b.centerY)
    .map((row)=>row.entries.sort((a,b)=>a.left-b.left).map((entry)=>entry.text).join(" "))
    .filter(Boolean)
    .join("\n");
}



// Recompone renglones usando las cajas reales que devuelve Tesseract.
// A diferencia de los recortes por coordenadas, la asociación depende de dónde
// encontró cada palabra en esta fotografía concreta.
function reconstructLinesFromOcrWords(rawWords: unknown): string {
  if (!Array.isArray(rawWords)) return "";
  const words = rawWords.map((item: any) => {
    const text = String(item?.text ?? "").trim();
    const box = item?.bbox;
    if (!text || !box || ![box.x0, box.y0, box.x1, box.y1].every((n: unknown) => typeof n === "number" && Number.isFinite(n))) return null;
    const height = Math.max(1, box.y1 - box.y0);
    return { text, x: box.x0, y: (box.y0 + box.y1) / 2, top: box.y0, bottom: box.y1, height, confidence: Number(item?.confidence ?? 0) };
  }).filter(Boolean) as Array<{text:string;x:number;y:number;top:number;bottom:number;height:number;confidence:number}>;
  if (words.length < 5) return "";
  words.sort((a,b)=>a.y-b.y || a.x-b.x);
  const rows: Array<{ center:number; height:number; words: typeof words }> = [];
  for (const word of words) {
    let row = rows.find((candidate) => Math.abs(candidate.center-word.y) <= Math.max(7, Math.min(candidate.height,word.height)*0.62));
    if (!row) { row={center:word.y,height:word.height,words:[]}; rows.push(row); }
    row.words.push(word);
    row.center=row.words.reduce((sum,item)=>sum+item.y,0)/row.words.length;
    row.height=Math.max(row.height,word.height);
  }
  return rows.sort((a,b)=>a.center-b.center).map(row=>row.words.sort((a,b)=>a.x-b.x).map(word=>word.text).join(" ")).filter(Boolean).join("\n");
}


// Extrae campos por rótulo y posición real de las palabras de cada pasada OCR.
// No presupone que el papel ocupe un porcentaje fijo de la foto ni que el ticket
// tenga siempre la misma escala, márgenes o encuadre.
function readClosureMetadataFromOcrWords(rawWords: unknown) {
  if (!Array.isArray(rawWords)) return {
    agencyCode:null, subagentCode:null, machineCode:null, address:null,
    terminalId:null, printedAt:null, periodNumber:null,
  };
  const words = rawWords.map((item: any) => {
    const text = String(item?.text ?? "").trim();
    const box = item?.bbox;
    if (!text || !box || ![box.x0,box.y0,box.x1,box.y1].every((n:unknown)=>typeof n==="number"&&Number.isFinite(n))) return null;
    return {
      text,
      x:Number(box.x0),
      y:(Number(box.y0)+Number(box.y1))/2,
      height:Math.max(1,Number(box.y1)-Number(box.y0)),
    };
  }).filter(Boolean) as Array<{text:string;x:number;y:number;height:number}>;
  words.sort((a,b)=>a.y-b.y||a.x-b.x);
  const rows:Array<{y:number;height:number;words:typeof words;text:string}>=[];
  for(const word of words){
    let row=rows.find(candidate=>Math.abs(candidate.y-word.y)<=Math.max(5,Math.min(candidate.height,word.height)*0.55));
    if(!row){
      row={y:word.y,height:word.height,words:[],text:""};
      rows.push(row);
    }
    row.words.push(word);
    row.y=row.words.reduce((sum,item)=>sum+item.y,0)/row.words.length;
    row.height=Math.max(row.height,word.height);
  }
  for(const row of rows){
    row.words.sort((a,b)=>a.x-b.x);
    row.text=row.words.map(word=>word.text).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
  }

  const normalizeCode=(raw:string,length:number):string|null=>{
    const compact=raw.toUpperCase().replace(/[\s.:_-]/g,"")
      .replace(/[OQ]/g,"0").replace(/[IL|!]/g,"1");
    return new RegExp("^\\d{"+length+"}$").test(compact)?compact:null;
  };
  const digitsAfter=(text:string,label:RegExp,length:number):string|null=>{
    const match=label.exec(text);
    if(!match||match.index===undefined)return null;
    const suffix=text.slice(match.index+match[0].length);
    const pattern=new RegExp("^\\s*[:#.,-]?\\s*([0-9OQIL|!](?:[\\s.:_-]*[0-9OQIL|!]){"+(length-1)+"})(?![A-Z0-9])","i");
    const value=suffix.match(pattern)?.[1];
    return value?normalizeCode(value,length):null;
  };
  const tokenAfter=(text:string,label:RegExp,min:number,max:number):string|null=>{
    const match=label.exec(text);
    if(!match||match.index===undefined)return null;
    const suffix=text.slice(match.index+match[0].length);
    const token=suffix.match(/^\s*[:#.,-]?\s*([0-9OQIL|!]{4,7})(?![A-Z0-9])/i)?.[1]??"";
    const compact=token.replace(/[OQ]/g,"0").replace(/[IL|!]/g,"1");
    return new RegExp("^\\d{"+min+","+max+"}$").test(compact)?compact:null;
  };
  const agencyLabel=/(?:\bAGENCIA\b|\bAG\b|\bA\s*[:.]\s*B)\s*[:.]?\s*/i;
  const subagentLabel=/(?:\bSUBAG(?:ENTE)?\b|\bSIBAG\b|\bSILAG\b|\bSIEAG\b|\bS[UI1]B?A?G\b)\s*[:.]?\s*/i;
  const machineLabel=/(?:\bMAQUINA\b|\bMAQ\b)\s*[:.]?\s*/i;
  const terminalLabel=/(?:\bMAQUINA\b|\bMAQ\b)\s+REAL\s*[:.]?\s*/i;
  const periodLabel=/\bPER[I1]ODO\b\s*(?:NRO|NO|N[º°.]?)?\s*[:.]?\s*/i;
  const addressLabel=/\b(?:DOMICILIO|DIRECCION|DIREC)\b\s*[:.]?\s*/i;
  const readPeriod=(index:number):string|null=>{
    const row=rows[index];
    if(!row)return null;
    const match=periodLabel.exec(row.text);
    if(!match||match.index===undefined)return null;
    const suffix=row.text.slice(match.index+match[0].length);
    const pattern=/^\s*[:#.,-]?\s*([0-9OQIL|!](?:[\s.:_-]*[0-9OQIL|!]){6})(?![A-Z0-9])/i;
    const direct=suffix.match(pattern)?.[1];
    if(direct)return normalizeCode(direct,7);
    const next=rows[index+1];
    if(!next||next.y-row.y>Math.max(row.height,next.height)*1.8)return null;
    if(!/^[0-9OQIL|! .:_-]+$/.test(next.text))return null;
    const nextMatch=next.text.match(/^\s*([0-9OQIL|!](?:[\s.:_-]*[0-9OQIL|!]){6})\s*$/i)?.[1];
    return nextMatch?normalizeCode(nextMatch,7):null;
  };
  const first=(values:Array<string|null>)=>values.find(value=>value!==null)??null;

  const agency=first(rows.map(row=>digitsAfter(row.text,agencyLabel,3)));
  const subagent=first(rows.map(row=>digitsAfter(row.text,subagentLabel,3)));
  const machine=first(rows.map(row=>/MAQUINA\s+REAL/i.test(row.text)?null:digitsAfter(row.text,machineLabel,2)));
  const terminal=first(rows.map(row=>tokenAfter(row.text,terminalLabel,4,6)));
  const period=first(rows.map((_,index)=>readPeriod(index)));

  const address=first(rows.map(row=>{
    const label=addressLabel.exec(row.text);
    if(label&&label.index!==undefined){
      const value=row.text.slice(label.index+label[0].length).trim();
      return /\d/.test(value)&&/[A-Z]/.test(value)?value:null;
    }
    return /\b(?:LA RIOJA|CATAMARCA|CORRIENTES|CALLE|AVENIDA|RUTA)\b/.test(row.text)&&/\b\d{1,5}\b/.test(row.text)
      ? row.text : null;
  }));

  const printed=first(rows.map(row=>{
    if(!/\bIMPRES[O0]\b/.test(row.text))return null;
    const date=row.text.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/)?.[0];
    const time=row.text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0];
    return date&&time?date+" "+time:null;
  }));

  return {
    agencyCode:agency,
    subagentCode:subagent,
    machineCode:machine,
    address,
    terminalId:terminal,
    printedAt:printed,
    periodNumber:period,
  };
}

function readOcrConsensus(values:Array<string|null|undefined>):string|null {
  const counts=new Map<string,number>();
  for(const raw of values){
    const value=String(raw??"").trim();
    if(value)counts.set(value,(counts.get(value)??0)+1);
  }
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  return ranked[0]&&ranked[0][1]>=2&&(!ranked[1]||ranked[0][1]>ranked[1][1])
    ? ranked[0][0] : null;
}

function closureBatchKey(ticket: TicketClosureData): string {
  const agency = String(ticket.agencyCode ?? "").replace(/\D/g, "");
  const subagent = String(ticket.subagentCode ?? "").replace(/\D/g, "");
  const period = String(ticket.periodNumber ?? "").replace(/\s+/g, "");
  const date = String(ticket.closedAt?.date ?? ticket.printedAt?.date ?? ticket.openedAt?.date ?? "");
  return agency + "|" + subagent + "|" + period + "|" + date;
}

function extractTicketNumber(text: string): string {
  const normalizedText = normalize(text);
  const patterns = [
    /\b(?:CUPON|TICKET|TKT|COMPROBANTE)\s*(?:(?:NRO|NUM(?:ERO)?|N[°º]|N|#)\s*)?[:.#º°-]?\s*([A-Z0-9][A-Z0-9-]{1,23})\b/,
    /\b(?:NRO|NUM(?:ERO)?|N[°º]|#)\s*(?:DE\s*)?(?:CUPON|TICKET|COMPROBANTE)\s*[:.#º°-]?\s*([A-Z0-9][A-Z0-9-]{1,23})\b/,
  ];
  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    const candidate = match?.[1]?.replace(/[.,;:]$/, "") ?? "";
    if (candidate.length >= 2 && /\d/.test(candidate)) return candidate;
  }
  return "";
}

function createManualClosureTemplate(games: Game[]): TicketClosureData {
  const metric = () => ({ count: 0, amount: 0 });
  const time = () => ({ date: null, time: null, raw: null });
  return {
    type: "loteria-corrientes-end-of-day-v1",
    header: "FIN DE JORNADA",
    agencyCode: null,
    subagentCode: null,
    machineCode: null,
    address: null,
    terminalId: null,
    printedAt: time(),
    openDraws: [
      { name: "Loto Plus Ciudad B.A.", status: "ON-OFF" },
      { name: "Loto Plus Extraordinario", status: "ON-OFF" },
      { name: "Quini 6 Santa Fe", status: "ON-OFF" },
      { name: "Brinco Santa Fe", status: "ON-OFF" },
      { name: "Loto 5 Plus Ciudad B.A.", status: "ON-OFF" },
      { name: "Telekino", status: "ON-OFF" },
      { name: "Quiniela Corrientes", status: "ON-OFF" },
    ],
    quiniela: { valids: metric(), cancelledSpecial: metric(), prizesPaid: metric() },
    quinielaAlToque: { valids: metric(), prizesPaid: metric() },
    otherGames: [
      { name: "Loto Plus", count: 0, amount: 0 },
      { name: "Quini 6", count: 0, amount: 0 },
      { name: "Pozo Quiniela", count: 0, amount: 0 },
      { name: "Brinco", count: 0, amount: 0 },
      { name: "Loto 5 Plus", count: 0, amount: 0 },
      { name: "Lotería Online", count: 0, amount: 0 },
      { name: "Quiniela Poceada", count: 0, amount: 0 },
      { name: "Telekino", count: 0, amount: 0 },
    ],
    totalOtherGames: metric(),
    otherGamesPrizes: metric(),
    totalPrizes: metric(),
    generalTotal: metric(),
    digital: { cobros: metric(), devoluciones: metric() },
    periodNumber: null,
    openedAt: time(),
    closedAt: time(),
    downloadStatus: null,
    consistency: { salesTotalsMatch: true, prizeTotalsMatch: true },
    commissionRates: Object.fromEntries(games.map((game) => [
      normalize(game.name),
      game.commissionPercent == null || !Number.isFinite(Number(game.commissionPercent))
        ? null : Number(game.commissionPercent),
    ])),
    rawText: "",
  };
}

function formatDateDdMmYyyy(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return iso[3] + "/" + iso[2] + "/" + iso[1];
  const local = value.match(/^(\d{2})[/-](\d{2})[/-](\d{2,4})$/);
  if (local) {
    const year = local[3]!.length === 2 ? "20" + local[3] : local[3]!;
    return local[1] + "/" + local[2] + "/" + year;
  }
  return value;
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

function parseTicketText(text: string, games: Game[], recoveredPeriodNumber = "", assumeEndOfDay = false) {
  // En modalidad diaria, la foto corresponde al cierre de jornada. No exigir que
  // el OCR general transcriba perfectamente el encabezado para analizar el cuerpo.
  const receiptData = parseTicketClosure(text, assumeEndOfDay);
  if (receiptData) {
    return {
      amountMap: mapTicketClosureAmounts(receiptData, games),
      period: "",
      drawNumber: "",
      date: null,
      ticketNumber: receiptData.periodNumber ?? recoveredPeriodNumber ?? "",
      detectedGames: ["Cierre de jornada"],
      receiptData,
    };
  }
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
        amountMap[game.id] = String(Math.round(amount));
        break;
      }
    }
  }

  const totalLineAmounts = lines
    .filter((line) => /\b(TOTAL|IMPORTE|MONTO|APUESTA TOTAL|TOTAL JUGADA|VALOR TOTAL)\b/i.test(normalize(line)))
    .flatMap(amountsFromLine);
  const ticketTotal = totalLineAmounts.at(-1);
  if (matchedGames.length === 1 && ticketTotal && !amountMap[matchedGames[0]!.id]) {
    amountMap[matchedGames[0]!.id] = String(Math.round(ticketTotal));
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
    ["QUINIELA POCEADA", "Quiniela Poceada Correntina"],
    ["POCEADA", "Quiniela Poceada Correntina"],
    ["LOTO 5 PLUS", "Loto 5 Plus"],
    ["LOTO PLUS", "Loto Plus"],
    ["QUINI 6", "Quini 6"],
    ["QUINI6", "Quini 6"],
    ["BRINCO", "Brinco"],
    ["AL TOQUE", "Al Toque (acumulado diario)"],
    ["LA PREVIA", "La Previa"],
    ["EL PRIMERO", "El Primero"],
    ["PRIMERA", "El Primero"],
    ["MATUTINA", "Matutina"],
    ["VESPERTINA", "Vespertina"],
    ["NOCTURNA", "Nocturna"],
  ];
  const detectedPeriod = periodOptions.find(([label]) => normalText.includes(label))?.[1] ?? "";
  const ticketNumber = extractTicketPeriodNumber(text) ?? (recoveredPeriodNumber || extractTicketNumber(text));

  return {
    amountMap,
    date,
    period: detectedPeriod,
    drawNumber: drawMatch?.[1] ?? "",
    ticketNumber,
    detectedGames: matchedGames.map((game) => game.name),
    receiptData: null,
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

type ReceiptPaperBounds = { left:number; top:number; width:number; height:number };
type FocusedClosureMetadata = Partial<Pick<TicketClosureData,
  "agencyCode" | "subagentCode" | "machineCode" | "address" | "terminalId" | "printedAt" | "periodNumber"
>>;

function longestBrightRun(scores:number[],threshold:number,from:number,to:number) {
  let bestStart=-1,bestEnd=-1,runStart=-1;
  const start=Math.max(0,Math.floor(from)),end=Math.min(scores.length,Math.ceil(to));
  for(let i=start;i<end;i+=1) {
    if((scores[i]??0)>=threshold) { if(runStart<0)runStart=i; }
    else if(runStart>=0) {
      if(bestStart<0||i-runStart>bestEnd-bestStart){bestStart=runStart;bestEnd=i;}
      runStart=-1;
    }
  }
  if(runStart>=0&&(bestStart<0||end-runStart>bestEnd-bestStart)){bestStart=runStart;bestEnd=end;}
  return bestStart>=0&&bestEnd>bestStart?{start:bestStart,end:bestEnd}:null;
}

function detectReceiptPaperBounds(bitmap:ImageBitmap):ReceiptPaperBounds {
  const scale=Math.min(1,400/bitmap.width,760/bitmap.height);
  const scan=document.createElement("canvas");
  scan.width=Math.max(1,Math.round(bitmap.width*scale));
  scan.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=scan.getContext("2d",{willReadFrequently:true});
  if(!context)return {left:0,top:0,width:bitmap.width,height:bitmap.height};
  context.drawImage(bitmap,0,0,scan.width,scan.height);
  const pixels=context.getImageData(0,0,scan.width,scan.height).data;
  // Usar percentiles en lugar del promedio: con fondo negro, el papel ocupa
  // solo una parte de la altura/ancho y el promedio queda artificialmente oscuro.
  // El percentil conserva la señal clara del papel aunque haya texto y fondo oscuro.
  const luminance=(x:number,y:number)=>{
    const i=(y*scan.width+x)*4;
    return .299*pixels[i]!+.587*pixels[i+1]!+.114*pixels[i+2]!;
  };
  const percentile=(values:number[],fraction:number)=>{
    if(!values.length)return 0;
    values.sort((a,b)=>a-b);
    return values[Math.min(values.length-1,Math.floor((values.length-1)*fraction))]??0;
  };
  const columns=new Array<number>(scan.width).fill(0);
  for(let x=0;x<scan.width;x+=1){
    const samples:number[]=[];
    for(let y=Math.floor(scan.height*.03);y<scan.height*.97;y+=2)samples.push(luminance(x,y));
    columns[x]=percentile(samples,.72);
  }
  const horizontal=longestBrightRun(columns,132,scan.width*.02,scan.width*.99);
  if(!horizontal||horizontal.end-horizontal.start<scan.width*.22)return {left:0,top:0,width:bitmap.width,height:bitmap.height};
  const innerLeft=Math.round(horizontal.start+(horizontal.end-horizontal.start)*.03);
  const innerRight=Math.round(horizontal.end-(horizontal.end-horizontal.start)*.03);
  const rows=new Array<number>(scan.height).fill(0);
  for(let y=0;y<scan.height;y+=1){
    const samples:number[]=[];
    for(let x=innerLeft;x<innerRight;x+=2)samples.push(luminance(x,y));
    rows[y]=percentile(samples,.48);
  }
  const vertical=longestBrightRun(rows,125,scan.height*.015,scan.height*.99);
  const sx=bitmap.width/scan.width;
  const sy=bitmap.height/scan.height;
  const paperLeft=Math.max(0,Math.round(horizontal.start*sx));
  const paperWidth=Math.max(1,Math.min(bitmap.width,Math.round((horizontal.end-horizontal.start)*sx)));
  // Si no hay una franja vertical clara y suficientemente grande, no recortar:
  // es más seguro OCR sobre la foto completa que desplazar todos los campos.
  if(!vertical||vertical.end-vertical.start<scan.height*.35)
    return {left:0,top:0,width:bitmap.width,height:bitmap.height};
  const paperTop=Math.max(0,Math.round(vertical.start*sy));
  const paperBottom=Math.min(bitmap.height,Math.round(vertical.end*sy));
  const verticalPadding=Math.round((paperBottom-paperTop)*.012);
  const top=Math.max(0,paperTop-verticalPadding);
  const bottom=Math.min(bitmap.height,paperBottom+verticalPadding);
  return {left:paperLeft,top,width:paperWidth,height:Math.max(1,bottom-top)};
}

async function makeReceiptPaperCanvas(file:File):Promise<HTMLCanvasElement> {
  const bitmap=await createImageBitmap(file);
  try {
    const bounds=detectReceiptPaperBounds(bitmap);
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,bounds.width);
    canvas.height=Math.max(1,bounds.height);
    const context=canvas.getContext("2d");
    if(!context)throw new Error("No se pudo preparar el papel del comprobante.");
    context.drawImage(bitmap,bounds.left,bounds.top,bounds.width,bounds.height,0,0,canvas.width,canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}


export function RenditionEntryForm({ agentId, games, today, periods, allPeriods, defaultPeriod, initialRendition, dailyMode = false, dailyCloseAllowed = true, receiptOnlyMode = false, batchMode = false }: { agentId: string; games: Game[]; today: string; periods: OfficialDrawPeriod[]; allPeriods?: OfficialDrawPeriod[]; defaultPeriod?: string; initialRendition?: InitialRendition; dailyMode?: boolean; dailyCloseAllowed?: boolean; receiptOnlyMode?: boolean; batchMode?: boolean }) {
  const [mode, setMode] = useState<"photo" | "manual">(receiptOnlyMode ? "photo" : initialRendition?.captureMethod === "manual" ? "manual" : "photo");
  const [date, setDate] = useState(initialRendition?.renditionDate ?? today);
  const [period, setPeriod] = useState(initialRendition?.period ?? (dailyMode ? "Cierre diario" : defaultPeriod ?? periods[0]?.label ?? ""));
  const [periodManuallySelected, setPeriodManuallySelected] = useState(Boolean(initialRendition));
  const [detectedPeriodMismatch, setDetectedPeriodMismatch] = useState("");
  const selectedPeriodDefinition = periods.find((candidate) => candidate.label === period) ?? (initialRendition?.period ? (allPeriods ?? periods).find((candidate) => candidate.label === initialRendition.period) ?? null : null);
  const periodGames = useMemo(() => dailyMode ? games.filter((game) => game.enabled !== false) : getGamesForDrawPeriod(selectedPeriodDefinition, games), [dailyMode, games, selectedPeriodDefinition]);
  const [drawNumber, setDrawNumber] = useState(initialRendition?.drawNumber ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>(initialRendition?.amounts ?? {});
  const [ticketNumbers, setTicketNumbers] = useState((initialRendition?.ticketNumbers ?? []).join("\n"));
  const [qrPayload, setQrPayload] = useState(initialRendition?.qrPayload ?? "");
  const [reference, setReference] = useState(initialRendition?.reference ?? "");
  const [notes, setNotes] = useState(initialRendition?.notes ?? "");
  const [receiptData, setReceiptData] = useState<TicketClosureData | null>(initialRendition?.receiptData ?? null);
  const [batchTickets, setBatchTickets] = useState<TicketClosureData[]>(() => {
    const saved: any = initialRendition?.receiptData;
    return saved?.type === "loteria-corrientes-end-of-day-batch-v1" && Array.isArray(saved.tickets) ? saved.tickets : [];
  });
  const batchTicketsRef = useRef<TicketClosureData[]>(batchTickets);
  const [gameListExpanded, setGameListExpanded] = useState(false);
  const [receiptReviewed, setReceiptReviewed] = useState(Boolean((initialRendition?.receiptData as any)?.userConfirmedReview));
  const [ocrText, setOcrText] = useState("");
  const [fileName, setFileName] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  const confirmationId = useId();
  const ticketPhotoInputId = useId();
  const existingTicketPhotoInputId = useId();
  const [ticketCaptureTarget, setTicketCaptureTarget] = useState<"main" | "existing">("main");
  const [ticketCaptureChoiceOpen, setTicketCaptureChoiceOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraStreamVersion, setCameraStreamVersion] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [dailyStatusChoice, setDailyStatusChoice] = useState<"complete" | "incomplete">(dailyMode && !dailyCloseAllowed ? "incomplete" : "complete");
  const [pendingAmount, setPendingAmount] = useState("");

  useEffect(() => {
    if (!cameraOpen) return;
    const video = cameraVideoRef.current;
    const stream = cameraStreamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      setCameraError("No se pudo iniciar la vista de la cámara. Cerrá y volvé a abrirla; también podés elegir una foto o archivo.");
    });
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [cameraOpen, cameraStreamVersion]);

  useEffect(() => () => {
    const stream = cameraStreamRef.current;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
  }, []);

  const total = useMemo(() =>
    Object.values(amounts).reduce((sum, value) => sum + (Number(value) > 0 ? Number(value) : 0), 0),
    [amounts]
  );
  const commissionTotal = useMemo(() => periodGames.reduce((sum, game) => {
    const amount = Number(amounts[game.id] ?? 0), rate = game.commissionPercent;
    if (!Number.isFinite(amount) || amount <= 0 || rate == null || !Number.isFinite(Number(rate))) return sum;
    return sum + Math.round((amount * Number(rate) / 100 + Number.EPSILON) * 100) / 100;
  }, 0), [amounts, periodGames]);
  const netToRemit = Math.max(0, Math.round((total - commissionTotal + Number.EPSILON) * 100) / 100);
  const effectiveCommissionPercent = total > 0 ? commissionTotal / total * 100 : 0;
  const hasUnconfiguredCommission = periodGames.some((game) => Number(amounts[game.id] ?? 0) > 0 && (game.commissionPercent == null || !Number.isFinite(Number(game.commissionPercent))));
  // The OCR can misread the printed "Cerrado" / "Descarga confirmada" footer.
  // A structurally recognized closure ticket that the operator reviewed is sufficient.
  const receiptHasConfirmedClosure = Boolean(receiptData?.type === "loteria-corrientes-end-of-day-v1");
  const canConfirmClosedTicket = Boolean(
    receiptHasConfirmedClosure && receiptReviewed && receiptData?.userConfirmedReview === true
  );
  const canConfirmDaily = batchMode ? batchTickets.length > 0 && receiptReviewed : dailyCloseAllowed || canConfirmClosedTicket;

  // Refresh the proposed period at draw boundaries only while the form is untouched.
  useEffect(() => {
    if (
      initialRendition ||
      periodManuallySelected ||
      !defaultPeriod ||
      defaultPeriod === period ||
      !periods.some((candidate) => candidate.label === defaultPeriod)
    ) return;

    const hasStartedEntry = date !== today || Boolean(
      fileName ||
      photoPreviewUrl ||
      qrPayload ||
      drawNumber.trim() ||
      reference.trim() ||
      notes.trim() ||
      ticketNumbers.trim() ||
      Object.values(amounts).some((value) => Number(value) > 0) ||
      dailyStatusChoice !== "complete" ||
      confirmationOpen ||
      busy
    );
    if (!hasStartedEntry) {
      setPeriod(defaultPeriod);
      setDetectedPeriodMismatch("");
      setNotice("");
    }
  }, [amounts, busy, confirmationOpen, dailyStatusChoice, date, defaultPeriod, drawNumber, fileName, initialRendition, notes, period, periodManuallySelected, periods, photoPreviewUrl, qrPayload, reference, ticketNumbers, today]);

  async function makeEnhancedTicketImage(file: File): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.max(1, Math.min(2, 3000 / longestSide));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      throw new Error("No se pudo preparar la imagen para mejorar la lectura.");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    // Grises + contraste moderado: ayuda con papel térmico pálido sin umbralizar
    // los números finos ni destruir los puntos y separadores del comprobante.
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
      const gray = 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.55 + 128));
      pixels[i] = contrasted;
      pixels[i + 1] = contrasted;
      pixels[i + 2] = contrasted;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  function processSelectedTicketFile(file: File) {
    const declaredType = String(file.type ?? "").toLowerCase();
    const isDefinitelyVideo =
      declaredType.startsWith("video/") ||
      /\.(mp4|mov|m4v|avi|webm|3gp|3g2|mpeg|mpg|mkv|wmv)$/i.test(file.name);

    if (isDefinitelyVideo) {
      setError("El comprobante debe ser una foto fija, no un video. Elegí la cámara fotográfica o una imagen desde Archivos.");
      setNotice("");
      return;
    }

    // Algunos selectores/cámaras móviles devuelven type vacío o application/octet-stream.
    // Se permite que el decodificador de imágenes compruebe el archivo en lugar de descartarlo aquí.
    void processTicket(file);
  }


  async function startTicketCamera(facing: "environment" | "user") {
    setCameraError("");
    setCameraReady(false);
    setCameraStarting(true);
    const previousStream = cameraStreamRef.current;
    if (previousStream) previousStream.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    try {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        throw new Error("camera-unsupported");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      cameraStreamRef.current = stream;
      setCameraFacing(facing);
      setCameraStreamVersion((version) => version + 1);
      setCameraOpen(true);
      setTicketCaptureChoiceOpen(false);
    } catch (cause) {
      const errorName = cause && typeof cause === "object" && "name" in cause
        ? String((cause as { name?: unknown }).name ?? "")
        : "";
      const message = errorName === "NotAllowedError" || errorName === "PermissionDeniedError"
        ? "El navegador bloqueó el acceso a la cámara. Permití el uso de Cámara para este sitio y volvé a intentarlo. La carga de archivos sigue disponible."
        : errorName === "NotFoundError" || errorName === "DevicesNotFoundError"
          ? "No se encontró una cámara disponible en este dispositivo. Podés elegir una foto o archivo."
          : errorName === "NotReadableError" || errorName === "TrackStartError"
            ? "La cámara está ocupada por otra aplicación. Cerrá la otra aplicación y volvé a intentarlo."
            : "No se pudo iniciar la cámara. Revisá los permisos del navegador; también podés elegir una foto o archivo.";
      setCameraError(message);
      setCameraOpen(false);
      setTicketCaptureChoiceOpen(true);
    } finally {
      setCameraStarting(false);
    }
  }

  function closeTicketCamera() {
    const stream = cameraStreamRef.current;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraReady(false);
    setCameraError("");
  }

  async function captureTicketCameraPhoto() {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("La cámara todavía se está iniciando. Esperá un momento y volvé a tomar la foto.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("No se pudo preparar la foto. Cerrá la cámara y volvé a abrirla.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
    if (!blob) {
      setCameraError("No se pudo generar la foto. Volvé a intentarlo.");
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = new File([blob], "ticket-camara-" + stamp + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    closeTicketCamera();
    setTicketCaptureChoiceOpen(false);
    processSelectedTicketFile(file);
  }

  function renderTicketCaptureDialogs() {
    return (
      <>
        {ticketCaptureChoiceOpen && (
          <div className="ticket-capture-dialog-backdrop" role="presentation" onClick={() => setTicketCaptureChoiceOpen(false)}>
            <section className="ticket-capture-dialog" role="dialog" aria-modal="true" aria-labelledby={ticketPhotoInputId + "-capture-title"} onClick={(event) => event.stopPropagation()}>
              <div className="ticket-capture-dialog-heading">
                <h3 id={ticketPhotoInputId + "-capture-title"}>Elegí cómo cargar el ticket</h3>
                <p>La foto tomada con cámara y los archivos pasan por el mismo lector OCR.</p>
              </div>
              {cameraError && <p className="ticket-read-error" role="alert">{cameraError}</p>}
              {cameraStarting && <p className="ticket-read-notice" role="status">Solicitando acceso a la cámara…</p>}
              <div className="ticket-capture-dialog-actions">
                <button type="button" className="button primary" disabled={cameraStarting || busy} onClick={() => void startTicketCamera("environment")}>Usar cámara trasera</button>
                <button type="button" className="button secondary" disabled={cameraStarting || busy} onClick={() => void startTicketCamera("user")}>Usar cámara frontal</button>
                <button type="button" className="button ghost" disabled={busy} onClick={() => {
                  setTicketCaptureChoiceOpen(false);
                  setCameraError("");
                  const inputId = ticketCaptureTarget === "existing" ? existingTicketPhotoInputId : ticketPhotoInputId;
                  const input = document.getElementById(inputId) as HTMLInputElement | null;
                  input?.click();
                }}>Elegir foto o archivo</button>
              </div>
              <button type="button" className="button ghost ticket-capture-dialog-cancel" onClick={() => {
                setTicketCaptureChoiceOpen(false);
                setCameraError("");
              }}>Cancelar</button>
            </section>
          </div>
        )}
        {cameraOpen && (
          <div className="ticket-capture-dialog-backdrop" role="presentation" onClick={closeTicketCamera}>
            <section className="ticket-capture-dialog ticket-live-camera-dialog" role="dialog" aria-modal="true" aria-labelledby={ticketPhotoInputId + "-camera-title"} onClick={(event) => event.stopPropagation()}>
              <div className="ticket-capture-dialog-heading">
                <h3 id={ticketPhotoInputId + "-camera-title"}>Tomar foto del ticket</h3>
                <p>{cameraFacing === "environment" ? "Cámara trasera" : "Cámara frontal"} · Centrá el cupón completo en la imagen.</p>
              </div>
              <video
                ref={cameraVideoRef}
                className="ticket-live-camera-video"
                autoPlay
                playsInline
                muted
                onCanPlay={() => setCameraReady(true)}
                aria-label="Vista en vivo de la cámara para capturar el ticket"
              />
              {cameraError && <p className="ticket-read-error" role="alert">{cameraError}</p>}
              <div className="ticket-capture-dialog-actions">
                <button type="button" className="button secondary" disabled={cameraStarting || busy} onClick={() => void startTicketCamera(cameraFacing === "environment" ? "user" : "environment")}>
                  Cambiar a cámara {cameraFacing === "environment" ? "frontal" : "trasera"}
                </button>
                <button type="button" className="button primary" disabled={!cameraReady || cameraStarting || busy} onClick={() => void captureTicketCameraPhoto()}>
                  Tomar foto y leer ticket
                </button>
                <button type="button" className="button ghost" onClick={closeTicketCamera}>Cancelar</button>
              </div>
            </section>
          </div>
        )}
      </>
    );
  }

  async function processTicket(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    setProgress("Preparando lectura del ticket…");
    setProgressPercent(3);
    setDetectedPeriodMismatch("");
    setReceiptData(null);
    setReceiptReviewed(false);
    setFileName(file.name);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoExpanded(false);
    setOcrText("");
    let detectedQr = "";
    let qrPeriodCandidate = "";
    try {
      setProgress("Buscando el QR del ticket…");
      setProgressPercent(10);
      // El QR es complementario: un fallo al decodificarlo nunca debe cancelar el OCR principal.
      try {
        detectedQr = (await readQrFromImage(file)) ?? "";
      } catch {
        detectedQr = "";
      }
      if (detectedQr) {
        setQrPayload(detectedQr);
        const qr = structuredQr(detectedQr);
        // A historical closure ticket keeps its printed date in receiptData; the financial posting must stay on today's operational day.
        if (qr.date && !dailyMode) setDate(qr.date);
        if (qr.period) qrPeriodCandidate = qr.period;
        if (qr.drawNumber) setDrawNumber(qr.drawNumber);
        if (qr.ticketNumber) setTicketNumbers((previous) => previous.split(/\s+/).includes(qr.ticketNumber) ? previous : previous ? previous + "\n" + qr.ticketNumber : qr.ticketNumber);
        if (qr.amount && qr.game && !dailyMode) {
          const normalizedGame = normalize(qr.game);
          const target = games.find((game) => game.enabled !== false && aliasesFor(game).some((alias) => normalizedGame.includes(alias)));
          if (target) setAmounts((previous) => ({ ...previous, [target.id]: String(Math.round(qr.amount!)) }));
        }
      }

      setProgress("Iniciando lector avanzado de texto…");
      setProgressPercent(18);
      let recognizedText = "";
      let recoveredPeriodNumber = "";
      let focusedClosureMetadata: FocusedClosureMetadata = {};
      let focusedOcrDebugText = "";
      let closureTextCandidates: string[] = [];
      let receiptAmountsValidated = false;
      let receiptPrizesValidated = false;

      // Motor principal nuevo: PaddleOCR v6 en español, ejecutado localmente en el navegador.
      // Tesseract queda únicamente como respaldo si el motor/modelo no puede iniciarse.
      try {
        const paddle = await getPaddleOcrEngine();
        setProgress("Reconociendo los renglones impresos del cupón…");
        setProgressPercent(35);
        const [paddleResult] = await paddle.predict(file);
        recognizedText = paddleOcrItemsToText(paddleResult?.items ?? []);
      } catch {
        recognizedText = "";
      }

      if (!recognizedText.trim()) {
        setProgress("Activando lector de respaldo…");
        setProgressPercent(42);
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("spa+eng", 1, {
          logger: (message) => {
            if (message.status === "recognizing text" && typeof message.progress === "number") {
              const percent = Math.min(96, 42 + Math.round(message.progress * 52));
              setProgressPercent(percent);
              setProgress("Reconociendo ticket…");
            }
          },
        });
        try {
          const result = await worker.recognize(file);
          recognizedText = result.data.text ?? "";
        } finally {
          await worker.terminate();
        }
      }

      if (!recognizedText.trim()) {
        throw new Error("No se pudo reconocer texto de la foto. Volvé a capturar el cupón completo, enfocado y con buena luz.");
      }
      if (dailyMode || receiptOnlyMode || batchMode) {
        closureTextCandidates = [recognizedText];
      }

      setOcrText(recognizedText);
      const activeGames = games.filter((game) => game.enabled !== false);
      let parsed = parseTicketText(recognizedText, activeGames, recoveredPeriodNumber, dailyMode || receiptOnlyMode || batchMode);
      // Elegir la pasada OCR por la información real que logra extraer del cierre,
      // no solo por cantidad de renglones o rótulos reconocidos.
      if (closureTextCandidates.length && (dailyMode || receiptOnlyMode || batchMode)) {
        const candidateReceipts = closureTextCandidates
          .map((candidateText) => parseTicketClosure(candidateText, true))
          .filter((receipt): receipt is TicketClosureData => receipt !== null);
        const completeness = (receipt: TicketClosureData) => {
          const metrics = [
            receipt.quiniela.valids,
            receipt.quiniela.cancelledSpecial,
            receipt.quiniela.prizesPaid,
            receipt.quinielaAlToque.valids,
            receipt.quinielaAlToque.prizesPaid,
            ...receipt.otherGames.map((game) => ({ amount: game.amount })),
            receipt.totalOtherGames,
            receipt.otherGamesPrizes,
            receipt.totalPrizes,
            receipt.generalTotal,
            receipt.digital.cobros,
            receipt.digital.devoluciones,
          ];
          const populatedMetrics = metrics.filter((metric) => metric.amount !== null).length;
          const populatedIdentity = [
            receipt.agencyCode,
            receipt.subagentCode,
            receipt.machineCode,
            receipt.address,
            receipt.terminalId,
            receipt.periodNumber,
            receipt.printedAt.date,
          ].filter(Boolean).length;
          return populatedMetrics * 5 + populatedIdentity * 4 +
            (receipt.consistency.salesTotalsMatch === true ? 12 : 0) +
            (receipt.consistency.prizeTotalsMatch === true ? 8 : 0);
        };
        // La cantidad de cifras reconocidas no es una medida de exactitud.
        // Solo aceptar importes cuando los renglones válidos suman TOTAL GENERAL.
        const salesSignature = (receipt:TicketClosureData) => JSON.stringify([
          receipt.quiniela.valids.amount,
          receipt.quinielaAlToque.valids.amount,
          ...receipt.otherGames.map(game=>game.amount),
          receipt.generalTotal.amount,
        ]);
        const verifiedSales = candidateReceipts.filter(receipt=>receipt.consistency.salesTotalsMatch===true);
        const salesVotes = new Map<string,number>();
        for(const receipt of verifiedSales){
          const signature=salesSignature(receipt);
          salesVotes.set(signature,(salesVotes.get(signature)??0)+1);
        }
        const bestCandidate = verifiedSales
          .filter(receipt=>(salesVotes.get(salesSignature(receipt))??0)>=1)
          .map((receipt) => ({ receipt, score: completeness(receipt) }))
          .sort((a, b) => b.score - a.score)[0];
        if (bestCandidate) {
          recognizedText = bestCandidate.receipt.rawText;
          receiptAmountsValidated = true;
          const prizeSignature = (receipt:TicketClosureData) => JSON.stringify([
            receipt.quiniela.prizesPaid.amount,
            receipt.quinielaAlToque.prizesPaid.amount,
            receipt.otherGamesPrizes.amount,
            receipt.totalPrizes.amount,
          ]);
          const verifiedPrizes = candidateReceipts.filter(receipt=>receipt.consistency.prizeTotalsMatch===true);
          const prizeVotes = new Map<string,number>();
          for(const receipt of verifiedPrizes){
            const signature=prizeSignature(receipt);
            prizeVotes.set(signature,(prizeVotes.get(signature)??0)+1);
          }
          receiptPrizesValidated = bestCandidate.receipt.consistency.prizeTotalsMatch===true &&
            (prizeVotes.get(prizeSignature(bestCandidate.receipt))??0)>=1;
          parsed = {
            ...parsed,
            amountMap: mapTicketClosureAmounts(bestCandidate.receipt, activeGames),
            period: "",
            drawNumber: "",
            date: null,
            ticketNumber: bestCandidate.receipt.periodNumber ?? recoveredPeriodNumber ?? "",
            detectedGames: ["Cierre de jornada"],
            receiptData: bestCandidate.receipt,
          };
        } else {
          // No dejar valores monetarios del OCR en el formulario cuando no cierran.
          parsed = { ...parsed, amountMap: {} };
        }
      }
      if (batchMode && !parsed.receiptData) {
        setError("Esta modalidad acepta comprobantes oficiales FIN DE JORNADA. El cupón no se agregó al lote.");
        setProgress("No se incorporó el archivo. Elegí un cierre oficial o continuá con otro cupón.");
        setProgressPercent(0);
        return;
      }
      const detectedPeriod = parsed.period || qrPeriodCandidate;
      let autoDetectedPeriodChanged = false;
      let detectedPeriodDefinition: OfficialDrawPeriod | null = null;
      if (detectedPeriod && !dailyMode) {
        const recognized = resolveRecognizedDrawPeriod(detectedPeriod, allPeriods ?? periods);
        const selectablePeriod = recognized && periods.find((candidate) => candidate.label === recognized.label);
        if (!recognized || !selectablePeriod) {
          setDetectedPeriodMismatch("__UNRECOGNIZED__:" + detectedPeriod);
          setNotice("El ticket indica el período " + detectedPeriod + ", pero no coincide con una opción del cronograma actual. Revisá el período antes de guardar.");
        } else {
          detectedPeriodDefinition = selectablePeriod;
          autoDetectedPeriodChanged = recognized.label !== period;
          setPeriod(recognized.label);
          setPeriodManuallySelected(true);
          setDetectedPeriodMismatch("");
          setNotice("Período reconocido automáticamente: " + recognized.label + ". Revisá los importes antes de guardar.");
        }
      }
      const gamesForDetectedPeriod = dailyMode
        ? activeGames
        : getGamesForDrawPeriod(detectedPeriodDefinition ?? selectedPeriodDefinition, activeGames);
      const parsedAmountMap = Object.fromEntries(
        Object.entries(parsed.amountMap).filter(([gameId]) => gamesForDetectedPeriod.some((game) => game.id === gameId))
      );
      if (parsed.receiptData) {
        const commissionRates = Object.fromEntries(periodGames.map((game) => [
          normalize(game.name),
          game.commissionPercent == null || !Number.isFinite(Number(game.commissionPercent)) ? null : Number(game.commissionPercent),
        ]));
        const validPeriod = (value: string | null | undefined) =>
          value && /^\d{7}$/.test(value.replace(/\s+/g, "")) ? value.replace(/\s+/g, "") : null;
        // Período: aceptar únicamente una lectura de 7 dígitos ligada al rótulo impreso.
        // No usar el período del parser general, que puede confundirlo con otra cifra del ticket.
        // No recurrir al OCR general si las dos lecturas del recorte rotulado no coinciden:
        // es preferible dejar Período vacío a mostrar un código inventado de otra zona.
        const labelledPeriod = validPeriod(focusedClosureMetadata.periodNumber ?? parsed.receiptData.periodNumber);
        const validSubagent = (value: string | null | undefined) => {
          const digits = String(value ?? "").replace(/\D/g, "");
          return /^\d{3}$/.test(digits) ? digits : null;
        };
        const validAgencyCode = (value: string | null | undefined) => {
          const digits = String(value ?? "").replace(/\D/g, "");
          if (/^\d{3}$/.test(digits)) return digits;
          if (/^[01]\d{3}$/.test(digits)) return digits.slice(1);
          return null;
        };
        const emptyMetric = () => ({count:null,amount:null});
        const salesMetric = (metric:{count:number|null;amount:number|null}) =>
          receiptAmountsValidated ? {count:null,amount:metric.amount} : emptyMetric();
        const prizeMetric = (metric:{count:number|null;amount:number|null}) =>
          receiptPrizesValidated ? {count:null,amount:metric.amount} : emptyMetric();
        const closureReceipt = {
          ...parsed.receiptData,
          agencyCode: validAgencyCode(focusedClosureMetadata.agencyCode ?? parsed.receiptData.agencyCode),
          subagentCode: validSubagent(focusedClosureMetadata.subagentCode ?? parsed.receiptData.subagentCode),
          machineCode: focusedClosureMetadata.machineCode ?? parsed.receiptData.machineCode ?? null,
          address: focusedClosureMetadata.address ?? parsed.receiptData.address ?? null,
          terminalId: focusedClosureMetadata.terminalId ?? parsed.receiptData.terminalId ?? null,
          printedAt: focusedClosureMetadata.printedAt ?? parsed.receiptData.printedAt ?? {date:null,time:null,raw:null},
          periodNumber: labelledPeriod,
          // Cantidades, ventas, premios y medios digitales no verificados quedan vacíos.
          // No mostrar números estimados solo porque Tesseract haya devuelto cifras.
          quiniela: {
            ...parsed.receiptData.quiniela,
            valids:salesMetric(parsed.receiptData.quiniela.valids),
            cancelledSpecial:emptyMetric(),
            prizesPaid:prizeMetric(parsed.receiptData.quiniela.prizesPaid),
          },
          quinielaAlToque: {
            ...parsed.receiptData.quinielaAlToque,
            valids:salesMetric(parsed.receiptData.quinielaAlToque.valids),
            prizesPaid:prizeMetric(parsed.receiptData.quinielaAlToque.prizesPaid),
          },
          otherGames:parsed.receiptData.otherGames.map(game=>({
            ...game,
            count:null,
            amount:receiptAmountsValidated?game.amount:null,
          })),
          totalOtherGames:emptyMetric(),
          otherGamesPrizes:prizeMetric(parsed.receiptData.otherGamesPrizes),
          totalPrizes:prizeMetric(parsed.receiptData.totalPrizes),
          generalTotal:salesMetric(parsed.receiptData.generalTotal),
          digital:{cobros:emptyMetric(),devoluciones:emptyMetric()},
          commissionRates,
        };
        // The printed date stays in receipt metadata; the financial entry stays on today's operational day.
        setDate(initialRendition?.renditionDate ?? today);
        if (batchMode) {
          const ticketPeriod = String(closureReceipt.periodNumber ?? "").replace(/\s+/g, "");
          const ticketDate = String(closureReceipt.closedAt?.date ?? closureReceipt.printedAt?.date ?? closureReceipt.openedAt?.date ?? "");
          const ticketKey = closureBatchKey(closureReceipt);
          const validPrintedDate = /^\d{4}-\d{2}-\d{2}$/.test(ticketDate) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(ticketDate);
          if (!/^\d{7}$/.test(ticketPeriod) || !validPrintedDate) {
            setError("No pude confirmar el Período N.º de 7 dígitos y la fecha impresa del cupón. Revisá el ticket antes de agregarlo al lote.");
            setProgress("Cupón no incorporado: falta identificar correctamente su período o fecha.");
            setProgressPercent(0);
            return;
          }
          if (batchTicketsRef.current.some((item) => closureBatchKey(item) === ticketKey)) {
            setError("Este cupón ya fue agregado al lote. No se volvió a sumar.");
            setProgress("Cupón duplicado detectado; los importes del lote se mantienen sin cambios.");
            setProgressPercent(0);
            return;
          }
          const nextBatch = [...batchTicketsRef.current, closureReceipt];
          batchTicketsRef.current = nextBatch;
          setBatchTickets(nextBatch);
        }
        setReceiptData(closureReceipt);
        setGameListExpanded(true);
        setReceiptReviewed(false);
        setAmounts((previous) => {
          const incoming = mapTicketClosureAmounts(closureReceipt, periodGames);
          if (!batchMode) return incoming;
          const combined = { ...previous };
          for (const [gameId, rawAmount] of Object.entries(incoming)) {
            const add = parseMoney(String(rawAmount ?? "")) ?? 0;
            if (add <= 0) continue;
            combined[gameId] = String(Math.round((parseMoney(String(previous[gameId] ?? "")) ?? 0) + add));
          }
          return combined;
        });
        if (!dailyMode) {
          setDetectedPeriodMismatch("__DAILY_CLOSURE__");
          setNotice("Este comprobante es un FIN DE JORNADA completo. Para registrarlo, configurá este operador con modalidad Rendición diaria / cierre diario; no corresponde a un único sorteo.");
        }
      } else {
        setReceiptData(null);
        setAmounts((previous) => {
          if (!dailyMode) return autoDetectedPeriodChanged ? parsedAmountMap : { ...previous, ...parsedAmountMap };
          const combined = { ...previous };
          for (const [gameId, rawAmount] of Object.entries(parsedAmountMap)) {
            const scannedAmount = parseMoney(String(rawAmount));
            if (scannedAmount === null) continue;
            const priorAmount = parseMoney(previous[gameId] ?? "") ?? 0;
            combined[gameId] = String(Math.round(priorAmount + scannedAmount));
          }
          return combined;
        });
      }
      // The ticket's own printed date is preserved in receiptData. The financial posting
      // date stays on today's operational day so Caja's date guard is not bypassed.
      if (parsed.date && !parsed.receiptData) setDate(parsed.date);
      if (parsed.drawNumber) setDrawNumber(parsed.drawNumber);
      if (parsed.receiptData) {
        // Para un FIN DE JORNADA, el identificador del cupón es exactamente
        // el valor impreso en "Período N.º"; no anexar otro número detectado.
        setTicketNumbers("");
      } else if (parsed.ticketNumber) {
        setTicketNumbers((previous) => previous.split(/\s+/).includes(parsed.ticketNumber) ? previous : previous ? previous + "\n" + parsed.ticketNumber : parsed.ticketNumber);
      }
      const qr = detectedQr ? structuredQr(detectedQr) : null;
      if (qr?.amount && parsed.detectedGames.length === 1 && !parsedAmountMap[activeGames.find((game) => game.name === parsed.detectedGames[0])?.id ?? ""]) {
        const target = activeGames.find((game) => game.name === parsed.detectedGames[0]);
        if (target) setAmounts((previous) => ({
          ...previous,
          [target.id]: dailyMode
            ? String(Math.round((parseMoney(previous[target.id] ?? "") ?? 0) + qr.amount!))
            : String(Math.round(qr.amount!)),
        }));
      }

      const recognizedCount = Object.keys(parsedAmountMap).length;
      if (parsed.receiptData) {
        const printedDate = parsed.receiptData?.closedAt.date ?? parsed.receiptData?.printedAt.date ?? parsed.receiptData?.openedAt.date;
        setNotice(
          "Ticket leído. Cierre impreso: " + formatDateDdMmYyyy(printedDate) +
          ". La rendición financiera se registrará en la jornada operativa " + formatDateDdMmYyyy(today) +
          "; la fecha impresa queda en el comprobante y no modifica la Caja de ese día. Los renglones editables están abajo en Juegos e importes."
        );
        document.querySelector(".game-rendition-block")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (detectedQr && recognizedCount) {
        setNotice("QR e importes detectados. Revisá fecha, período y valores antes de registrar.");
      } else if (detectedQr) {
        setNotice("QR leído. Si el código no contiene los montos, completá lo que falte en la lista.");
      } else if (recognizedCount) {
        setNotice("Ticket leído. Los importes detectados se cargaron como propuesta; revisalos antes de guardar.");
      } else {
        setNotice("Se leyó el texto, pero no se pudieron confirmar importes. Completalos manualmente.");
      }
      setProgressPercent(100);
      setProgress("Lectura completada. Revisá los datos cargados abajo en Juegos e importes.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer la foto del ticket.");
      setProgress("La lectura no pudo completarse. Corregí la imagen e intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (receiptOnlyMode) {
    return (
      <form
        action={attachAgencyRenditionTicketReceiptDataToExisting}
        className="form-stack rendition-entry-form"
        noValidate
        onSubmit={(event) => {
          if (!receiptData || receiptData.type !== "loteria-corrientes-end-of-day-v1" || !receiptReviewed) {
            event.preventDefault();
            setError("Leé el ticket oficial de fin de jornada y marcá que revisaste el detalle antes de adjuntarlo.");
          }
        }}
      >
        <input type="hidden" name="agent_id" value={agentId} />
        <input type="hidden" name="rendition_id" value={initialRendition?.id ?? ""} />
        <input type="hidden" name="ticket_receipt_data" value={receiptData ? JSON.stringify({ ...receiptData, userConfirmedReview: receiptReviewed }) : ""} />
        <section className="ticket-capture-panel">
          <div className="ticket-photo-picker">
            <span className="ticket-photo-icon" aria-hidden="true">▧</span>
            <strong>Adjuntar detalle OCR al cierre existente</strong>
            <span>Seleccioná la foto original del FIN DE JORNADA o una copia guardada. Esto no vuelve a registrar importes ni cobros.</span>
            <button type="button" className="ticket-photo-picker-cta" disabled={busy} onClick={() => { setCameraError(""); setTicketCaptureTarget("existing"); setTicketCaptureChoiceOpen(true); }}>Elegir foto o archivo</button>
            <input
              id={existingTicketPhotoInputId}
              className="ticket-photo-native-input ticket-photo-operational-input"
              type="file"
              accept="image/*,.heic,.heif,.avif,.bmp,.gif,.tif,.tiff"
              aria-label="Elegir foto del ticket para recuperar el detalle OCR"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  processSelectedTicketFile(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
          {renderTicketCaptureDialogs()}
          {photoPreviewUrl && <div className="ticket-photo-preview"><img src={photoPreviewUrl} alt="Vista previa del ticket para recuperar su detalle OCR" /></div>}
          {progress && <p className="ticket-read-notice">{progress}{progressPercent > 0 ? " (" + progressPercent + "%)" : ""}</p>}
          {error && <p className="ticket-read-error" role="alert">{error}</p>}
          {notice && !error && <p className="ticket-read-notice">{notice}</p>}
          {ocrText && <details className="ticket-ocr-text"><summary>Ver texto reconocido</summary><pre>{ocrText}</pre></details>}
        </section>
        {receiptData && <TicketClosureReceipt data={receiptData} compact />}
        {receiptData && (
          <label className="ticket-input-block">
            <span><input
              type="checkbox"
              checked={receiptReviewed}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setReceiptReviewed(checked);
                setReceiptData((previous) => previous ? { ...previous, userConfirmedReview: checked } : previous);
              }}
            /> Confirmo que revisé los datos OCR del ticket oficial.</span>
          </label>
        )}
        <button className="button primary" type="submit" disabled={!receiptData || !receiptReviewed || busy}>
          {busy ? "Leyendo ticket…" : "Adjuntar OCR a esta rendición existente"}
        </button>
        <p className="muted small-text">Esta acción solo guarda el detalle del comprobante en el registro seleccionado. No crea otra rendición, no modifica ventas o importes y no registra movimientos en Caja.</p>
      </form>
    );
  }

  return (
    <form
      action={initialRendition ? updateAgencyRendition : createAgencyRendition}
      className="form-stack rendition-entry-form"
      noValidate
      onSubmit={(event) => {
        if (initialRendition) return;
        if (!confirmationOpen) {
          event.preventDefault();
          setConfirmationError("");
          setConfirmationOpen(true);
          return;
        }
        if (dailyStatusChoice === "complete" && !canConfirmDaily) {
          event.preventDefault();
          setConfirmationError("Para confirmar como rendida antes del horario de cierre, cargá y aceptá el ticket oficial de FIN DE JORNADA. También podés guardar como incompleta.");
          return;
        }
        if (dailyStatusChoice === "incomplete") {
          const pendingValue = Number(pendingAmount.replace(",", "."));
          if (!pendingAmount.trim() || !Number.isFinite(pendingValue) || pendingValue <= 0 || pendingValue >= netToRemit || pendingValue > 999999999999.99) {
            event.preventDefault();
            setConfirmationError("Ingresá la deuda que queda pendiente, mayor que cero y menor que el efectivo neto. El sistema calculará lo que efectivamente se entregó.");
            return;
          }
        }
        setConfirmationError("");
      }}
    >
      <input type="hidden" name="agent_id" value={agentId} />
      <input type="hidden" name="rendition_id" value={initialRendition?.id ?? ""} />
      <input type="hidden" name="ticket_qr_payload" value={qrPayload} />
      <input type="hidden" name="ticket_receipt_data" value={batchMode
        ? (batchTickets.length ? JSON.stringify({
            type: "loteria-corrientes-end-of-day-batch-v1",
            userConfirmedReview: receiptReviewed,
            agencyCode: batchTickets[0]?.agencyCode ?? null,
            subagentCode: batchTickets[0]?.subagentCode ?? null,
            tickets: batchTickets.map((ticket) => ({ ...ticket, userConfirmedReview: receiptReviewed })),
          }) : "")
        : (receiptData ? JSON.stringify(receiptData) : "")} />
      <input type="hidden" name="game_period" value={period} />
      <input type="hidden" name="draw_period" value={period} />
      <input type="hidden" name="draw_number" value={drawNumber} />
      <input type="hidden" name="capture_method" value={mode === "manual" ? "manual" : qrPayload ? "qr" : fileName ? "photo" : initialRendition?.captureMethod === "photo" ? "photo" : initialRendition?.captureMethod === "qr" ? "qr" : "manual"} />
      {!initialRendition && (
        <>
          <input type="hidden" name="operational_date" value={today} />
          <input type="hidden" name="draw_status" value={dailyStatusChoice} />
          <input type="hidden" name="reported_amount" value={dailyStatusChoice === "incomplete" ? Math.max(0, Math.round((netToRemit - Number(pendingAmount.replace(",", ".")) + Number.EPSILON) * 100) / 100).toFixed(2) : netToRemit.toFixed(2)} />
        </>
      )}

      <div className="rendition-mode-toolbar">
        <div className="rendition-mode-switch" role="group" aria-label="Método de carga de rendición">
          <button type="button" className={mode === "photo" ? "active" : ""} onClick={() => setMode("photo")}>Foto (automático)</button>
          <button type="button" className={mode === "manual" ? "active" : ""} onClick={() => {
            setMode("manual");
            if (!receiptData && !initialRendition) {
              const template = createManualClosureTemplate(games);
              setReceiptData(template);
              setReceiptReviewed(false);
              setGameListExpanded(true);
              setAmounts(mapTicketClosureAmounts(template, periodGames));
              setTicketNumbers("");
              setQrPayload("");
              setFileName("");
              setPhotoPreviewUrl("");
              setOcrText("");
              setDetectedPeriodMismatch(dailyMode ? "" : "__DAILY_CLOSURE__");
              setNotice(dailyMode
                ? "Plantilla FIN DE JORNADA lista para cargar manualmente los valores impresos del cupón."
                : "Plantilla lista. Para confirmar un FIN DE JORNADA completo, configurá modalidad Rendición diaria / cierre diario.");
              setError("");
            }
          }}>Carga manual</button>
        </div>
        {mode === "photo" && (
          <div className={"ticket-progress-panel" + (busy ? " is-reading" : progressPercent >= 100 ? " is-complete" : fileName ? " has-file" : "")} role="status" aria-live="polite">
            <div className="ticket-progress-heading">
              <div>
                <span>{busy ? "LEYENDO TICKET" : progressPercent >= 100 ? "TICKET LEÍDO" : fileName ? "LECTURA PENDIENTE" : "LECTURA AUTOMÁTICA"}</span>
                <strong>{busy ? progress || "Procesando imagen…" : progressPercent >= 100 ? "Lectura completada" : fileName || "Esperando foto del ticket"}</strong>
              </div>
              <b>{progressPercent}%</b>
            </div>
            <div className="ticket-progress-track" role="progressbar" aria-label="Progreso de lectura del ticket" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
              <span style={{ width: progressPercent + "%" }} />
            </div>
            <small>{busy ? "No cierres esta pantalla; al terminar, los datos aparecen abajo en Juegos e importes." : progressPercent >= 100 ? "Los datos reconocidos están abajo en Juegos e importes y se pueden editar antes de confirmar." : "Seleccioná una foto para iniciar la lectura."}</small>
          </div>
        )}
      </div>

      {mode === "manual" && !receiptData && (
        <section className="manual-closure-template-panel" aria-label="Carga manual de FIN DE JORNADA">
          <div>
            <strong>Cargar un FIN DE JORNADA sin foto</strong>
            <p>Abre el formato del cupón para ingresar los datos identificatorios, períodos, cantidades e importes en sus renglones correspondientes.</p>
          </div>
          <button type="button" className="button ghost" onClick={() => {
            const template = createManualClosureTemplate(games.filter((game) => game.enabled !== false));
            setReceiptData(template);
            setAmounts(mapTicketClosureAmounts(template, periodGames));
            setTicketNumbers("");
            setReceiptReviewed(false);
            setGameListExpanded(true);
            setNotice("Plantilla manual de FIN DE JORNADA abierta. Completá cada valor del cupón antes de confirmar.");
          }}>Usar formato FIN DE JORNADA</button>
        </section>
      )}

      {mode === "photo" && (
        <div className="ticket-capture-panel">
          <div className="ticket-photo-picker">
            <span className="ticket-photo-icon" aria-hidden="true">▧</span>
            <strong>Comprobante del ticket</strong>
            <span>Seleccioná una foto guardada en el teléfono o sacá una nueva.</span>
            <button type="button" className="ticket-photo-picker-cta" disabled={busy} onClick={() => { setCameraError(""); setTicketCaptureTarget("main"); setTicketCaptureChoiceOpen(true); }}>Elegir foto o archivo</button>
            <input
              id={ticketPhotoInputId}
              className="ticket-photo-native-input ticket-photo-operational-input"
              type="file"
              name="ticket_photo"
              aria-label="Elegir foto o archivo del comprobante del ticket"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  processSelectedTicketFile(file);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
          {renderTicketCaptureDialogs()}
          {batchMode && (
            <div className="weekly-ticket-batch-upload-help">
              <div>
                <strong>{batchTickets.length === 0 ? "Carga acumulada de FIN DE JORNADA" : `${batchTickets.length} cupón${batchTickets.length === 1 ? "" : "es"} agregado${batchTickets.length === 1 ? "" : "s"}`}</strong>
                <p>{batchTickets.length === 0 ? "Elegí el primer comprobante. Después podés agregar los demás, uno por uno, sin registrar una rendición todavía." : "El cupón ya está en este lote. Volvé a elegir otro archivo para sumar el siguiente comprobante a la misma rendición."}</p>
              </div>
              <button type="button" className="button ghost small" disabled={busy || batchTickets.length >= 12} onClick={() => {
                setCameraError("");
                setTicketCaptureChoiceOpen(true);
              }}>{batchTickets.length === 0 ? "Elegir primer FIN DE JORNADA" : "Agregar otro FIN DE JORNADA"}</button>
              <small>Repetí esta operación por cada cupón. Revisá la lista y marcá la revisión antes de tocar “Confirmar rendición acumulada”. Máximo 12 cupones por lote.</small>
            </div>
          )}
          {photoPreviewUrl && <div className="ticket-photo-preview"><button type="button" className="ticket-photo-preview-button" onClick={() => setPhotoExpanded(true)} aria-label="Ampliar foto del ticket"><img src={photoPreviewUrl} alt="Vista previa del ticket cargado" /><span>Ampliar foto</span></button></div>}
          {photoExpanded && photoPreviewUrl && <div className="ticket-photo-lightbox" role="dialog" aria-modal="true" aria-label="Foto del ticket ampliada" onClick={() => setPhotoExpanded(false)}><button type="button" className="ticket-photo-lightbox-close" onClick={() => setPhotoExpanded(false)}>Cerrar ✕</button><img src={photoPreviewUrl} alt="Foto del ticket ampliada" onClick={(event) => event.stopPropagation()} /></div>}
          <p className="muted small-text">También podés subir una foto guardada. La lectura se procesa en el navegador y la imagen se adjunta a la rendición para auditoría.</p>
          {fileName && <p className="ticket-file-label">Ticket cargado: <strong>{fileName}</strong></p>}

          {error && <p className="ticket-read-error" role="alert">{error}</p>}
          {notice && !error && <p className="ticket-read-notice">{notice}</p>}
          {receiptData && <p className="ticket-read-notice">Ticket de cierre identificado. El detalle completo, los porcentajes y las comisiones estimadas están en <strong>Juegos e importes</strong>.</p>}
          {qrPayload && <div className="qr-detected"><strong>✓ QR detectado</strong><code>{qrPayload.slice(0, 100)}{qrPayload.length > 100 ? "…" : ""}</code><button type="button" className="button ghost small" onClick={() => setQrPayload("")}>Quitar QR</button></div>}
          {ocrText && <details className="ticket-ocr-text"><summary>Ver texto reconocido</summary><pre>{ocrText}</pre></details>}
        </div>
      )}

      <div className="detail-grid rendition-meta-grid">
        <label>Fecha de la jornada financiera
          <input type="date" name={receiptData ? undefined : "rendition_date"} value={date} onChange={(event) => setDate(event.target.value)} disabled={Boolean(receiptData)} required />
          {receiptData && <input type="hidden" name="rendition_date" value={initialRendition?.renditionDate ?? today} />}
          <small className="muted">Día/mes/año: {formatDateDdMmYyyy(date)}{receiptData ? " · fijada a la jornada operativa para no alterar una Caja anterior" : ""}</small>
        </label>
        {dailyMode ? (
          <div className="rendition-daily-mode-summary"><strong>Modalidad</strong><span>Cierre diario único · se consolidan todos los juegos activos y sus importes.</span></div>
        ) : (
          <label>Período oficial del sorteo
            <select value={period} onChange={(event) => {
              const nextPeriod = event.target.value;
              setPeriodManuallySelected(true);
              if (nextPeriod !== period) {
                setAmounts({});
                setTicketNumbers("");
                setQrPayload("");
                setDrawNumber("");
                setReference("");
                setFileName("");
                setOcrText("");
                setPhotoPreviewUrl("");
                setDetectedPeriodMismatch("");
                setNotice("Cambiaste de sorteo: se limpiaron los importes, tickets y lecturas anteriores para no mezclar períodos.");
              }
              setPeriod(nextPeriod);
            }} required disabled={Boolean(initialRendition)}>
              <option value="" disabled>Seleccioná un sorteo</option>
              {initialRendition && period && !(allPeriods ?? periods).some((item) => item.label === period) && <option value={period}>{period} · histórico</option>}
              {periods.map((item) => <option key={item.label} value={item.label}>{item.label}{item.time ? " · " + item.time : " · acumulado diario"}</option>)}
            </select>
            {initialRendition && <span className="muted small-text">El período histórico queda bloqueado.</span>}
          </label>
        )}
        <label>Número de sorteo<input value={drawNumber} onChange={(event) => setDrawNumber(event.target.value)} placeholder="Se detecta de la foto" /></label>
        <label>Referencia<input name="reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Opcional" /></label>
      </div>
      {receiptData && (receiptData.closedAt.date || receiptData.printedAt.date) && (
        <p className="message ticket-operational-date-notice">
          El ticket informa cierre el <strong>{receiptData.closedAt.date ?? receiptData.printedAt.date}</strong>.
          Para esta prueba, la rendición financiera se registrará en la jornada operativa actual (<strong>{date}</strong>); no se reabre ni modifica la Caja de la fecha impresa.
        </p>
      )}
      {detectedPeriodMismatch && <p className="message error-message">
        {detectedPeriodMismatch === "__DAILY_CLOSURE__" ? (
          <>Este ticket consolida la jornada completa. Configurá la modalidad de este operador en <strong>Rendición diaria / cierre diario</strong> antes de registrarlo.</>
        ) : detectedPeriodMismatch.startsWith("__UNRECOGNIZED__:") ? (
          <>El ticket contiene el período <strong>{detectedPeriodMismatch.slice("__UNRECOGNIZED__:".length)}</strong>, que no está en el cronograma oficial. Seleccioná manualmente el sorteo oficial correcto y volvé a leer el ticket antes de guardar.</>
        ) : (
          <>El ticket corresponde a <strong>{detectedPeriodMismatch}</strong>. Cambiá al sorteo indicado y volvé a leerlo antes de guardar.</>
        )}
      </p>}
      {dailyMode
        ? <p className="muted small-text">Podés leer tickets de distintos sorteos: los importes detectados se agregan al mismo cierre. Verificá que no se dupliquen tickets y revisá todos los importes antes de confirmar.</p>
        : period && periods.length > 0 && <p className="muted small-text">Esta rendición corresponde exclusivamente a <strong>{period}</strong>; no se mezclan importes de otros sorteos.</p>}

      {receiptData && !gameListExpanded && (
        <section className="ticket-closure-quick-meta" aria-label="Datos identificatorios del FIN DE JORNADA">
          <h3>Identificación del FIN DE JORNADA</h3>
          <div className="ticket-closure-quick-meta-grid">
            <div><span>Agencia N.º</span><strong>{receiptData.agencyCode || "No detectado"}</strong></div>
            <div><span>Subagente N.º</span><strong>{receiptData.subagentCode || "No detectado"}</strong></div>
            <div><span>Máquina</span><strong>{receiptData.machineCode || "No detectada"}</strong></div>
            <div><span>Dirección de agencia</span><strong>{receiptData.address || "No detectada"}</strong></div>
            <div><span>Máquina real</span><strong>{receiptData.terminalId || "No detectada"}</strong></div>
            <div><span>Período N.º</span><strong>{receiptData.periodNumber || "No detectado"}</strong></div>
            <div className="ticket-closure-quick-meta-printed"><span>Impreso el</span><strong>{receiptData.printedAt.raw ?? ([receiptData.printedAt.date, receiptData.printedAt.time].filter(Boolean).join(" ") || "No detectado")}</strong></div>
          </div>
        </section>
      )}
      <div className="game-rendition-block">
        <div className="game-rendition-head">
          <div><h3>Juegos e importes</h3><p className="muted">{mode === "photo" ? "Los importes se leen automáticamente. Abrí el detalle para revisar o corregir los datos." : "La lista de carga manual está oculta para mantener la pantalla compacta."}</p></div>
          <div className="game-rendition-head-actions">
            <span className="rendition-live-total">{new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(total)}</span>
            <button type="button" className="button ghost game-rendition-toggle" aria-expanded={gameListExpanded} onClick={() => setGameListExpanded((open) => !open)}>
              {gameListExpanded ? "Cerrar lista completa" : "Abrir la lista completa"}
            </button>
          </div>
        </div>
        {gameListExpanded ? (
          batchMode ? (
            <div className="weekly-ticket-batch-panel">
              <div className="panel-head">
                <div><h3>Cupones incluidos en esta rendición</h3><p className="muted">Los cupones quedan separados por fecha; los importes de abajo son el total acumulado del lote.</p></div>
                <span className="badge">{batchTickets.length} cupones</span>
              </div>
              {batchTickets.map((ticket, index) => <details className="weekly-ticket-batch-row" key={String(ticket.periodNumber ?? "sin-periodo") + "-" + index}>
                <summary><strong>Cupón {index + 1} · Período {ticket.periodNumber || "no detectado"}</strong><small>{ticket.closedAt?.date ?? ticket.printedAt?.date ?? ticket.openedAt?.date ?? "Fecha impresa no detectada"}</small></summary>
                <TicketClosureReceipt data={ticket} compact editable onChange={(next) => {
                  const nextKey = closureBatchKey(next);
                  if (batchTicketsRef.current.some((item, itemIndex) => itemIndex !== index && closureBatchKey(item) === nextKey)) {
                    setError("Ese período y fecha ya están en otro cupón del lote. No se guardó la corrección duplicada.");
                    return;
                  }
                  const editableTicket = { ...next, userConfirmedReview: false };
                  const priorAmounts = mapTicketClosureAmounts(ticket, periodGames);
                  const nextAmounts = mapTicketClosureAmounts(editableTicket, periodGames);
                  setAmounts((previous) => {
                    const combined = { ...previous };
                    for (const game of periodGames) {
                      const current = parseMoney(String(previous[game.id] ?? "")) ?? 0;
                      const oldValue = parseMoney(String(priorAmounts[game.id] ?? "")) ?? 0;
                      const newValue = parseMoney(String(nextAmounts[game.id] ?? "")) ?? 0;
                      combined[game.id] = Math.max(0, current - oldValue + newValue).toFixed(2);
                    }
                    return combined;
                  });
                  const updated = batchTicketsRef.current.map((item, itemIndex) => itemIndex === index ? editableTicket : item);
                  batchTicketsRef.current = updated;
                  setBatchTickets(updated);
                  setReceiptData(updated[updated.length - 1] ?? null);
                  setReceiptReviewed(false);
                  setError("");
                }} />
              </details>)}
              <label className="ticket-input-block weekly-ticket-batch-review">
                <span><input type="checkbox" checked={receiptReviewed} onChange={(event) => setReceiptReviewed(event.currentTarget.checked)} />
                  Confirmo que revisé todos los cupones OCR de este lote.</span>
              </label>
              <div className="game-rendition-list">
                {periodGames.map((game) => <label className="game-rendition-row" key={game.id}>
                  <span><strong>{game.name}</strong><small>{game.category} · total de todos los cupones</small></span>
                  <input type="number" name={"game_" + game.id} min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={amounts[game.id] ?? ""} onChange={(event) => setAmounts((previous) => ({ ...previous, [game.id]: event.target.value }))} />
                </label>)}
              </div>
              <button type="button" className="button ghost small" disabled={!batchTickets.length || busy} onClick={() => {
                batchTicketsRef.current = [];
                setBatchTickets([]);
                setReceiptData(null);
                setReceiptReviewed(false);
                setAmounts(Object.fromEntries(games.map((game) => [game.id, ""])));
                setTicketNumbers("");
                setError("");
                setNotice("");
              }}>Vaciar lote y empezar de nuevo</button>
            </div>
          ) : receiptData ? (
            <>
              <TicketClosureReceipt data={receiptData} editable onChange={(next) => {
                setReceiptData({ ...next, userConfirmedReview: false });
                setReceiptReviewed(false);
                setAmounts(mapTicketClosureAmounts(next, periodGames));
                // El período del cupón no se copia al campo de número de ticket/cupón.
              }} />
              {periodGames.map((game) => <input key={game.id} type="hidden" name={"game_" + game.id} value={amounts[game.id] ?? "0"} />)}
              <div className="ticket-closure-accept-actions">
                <p>El ticket ya está cargado. Revisá los porcentajes y usá una sola vez el botón principal <strong>Confirmar y guardar rendición</strong> para continuar.</p>
                <button type="button" className="button ghost" onClick={() => {
                  setMode("manual");
                  const template = createManualClosureTemplate(games);
                  setReceiptData(template);
                  setReceiptReviewed(false);
                  setAmounts(mapTicketClosureAmounts(template, periodGames));
                  setTicketNumbers("");
                  setQrPayload("");
                  setFileName("");
                  setPhotoPreviewUrl("");
                  setOcrText("");
                  setGameListExpanded(true);
                  setDetectedPeriodMismatch(dailyMode ? "" : "__DAILY_CLOSURE__");
                  setNotice(dailyMode
                    ? "Plantilla FIN DE JORNADA lista para carga manual."
                    : "Plantilla lista. Configurá modalidad Rendición diaria / cierre diario antes de guardar.");
                }}>Quitar ticket y cargar manualmente</button>
              </div>
            </>
          ) : (
            <div className="game-rendition-list">
              {periodGames.map((game) => <label className="game-rendition-row" key={game.id}><span><strong>{game.name}</strong><small>{game.category}</small></span><input type="number" name={"game_" + game.id} min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={amounts[game.id] ?? ""} onChange={(event) => setAmounts((previous) => ({ ...previous, [game.id]: event.target.value }))} /></label>)}
              {!period && <p className="message">Elegí el período del sorteo.</p>}
              {period && !periodGames.length && <p className="message">No hay un juego activo asignado a este turno; no se mezclarán juegos de otros sorteos.</p>}
            </div>
          )
        ) : (
          <>
            {periodGames.map((game) => <input key={game.id} type="hidden" name={"game_" + game.id} value={amounts[game.id] ?? ""} />)}
            <div className="game-rendition-collapsed" role="status">
              <span className="game-rendition-collapsed-mark" aria-hidden="true">{receiptData ? "✓" : "…"}</span>
              <div>
                <strong>{batchMode && batchTickets.length ? batchTickets.length + " cupones de fin de jornada listos" : receiptData ? "Ticket de fin de jornada leído" : total > 0 ? "Importes reconocidos y listos para revisar" : "Lista de juegos contraída"}</strong>
                <p>{batchMode && batchTickets.length
                  ? "Se acumularon " + batchTickets.length + " cupones. Abrí la lista completa para revisar cada fecha y los importes consolidados antes de guardar."
                  : receiptData
                  ? "Los datos detectados se conservaron. Abrí la lista completa para revisar juegos, sorteos, importes y totales antes de guardar."
                  : total > 0
                    ? "Se detectaron importes por " + new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(total) + ". Abrí la lista para verificar o corregir cada valor."
                    : "La lista completa se mantiene oculta para que la pantalla no sea tan larga. Tocá “Abrir la lista completa” para cargar o revisar los importes manualmente."}</p>
              </div>
            </div>
          </>
        )}
      </div>

      <label className="ticket-input-block"><span>Número(s) de ticket / cupón</span><textarea name="ticket_numbers" rows={2} value={ticketNumbers} onChange={(event) => setTicketNumbers(event.target.value)} readOnly={batchMode} placeholder={batchMode ? "El detalle de cada cupón queda en el lote." : "Se completa desde la lectura o ingresalo manualmente."} /></label>
      <label className="ticket-input-block"><span>Observaciones</span><textarea name="notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional." /></label>
      <div className="rendition-settlement-bar">
        <div className="rendition-settlement-values">
          <div><span>Ventas brutas</span><strong>{new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(total)}</strong></div>
          <div><span>Comisión aplicada ({new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(effectiveCommissionPercent)}%)</span><strong className="commission-deduction">− {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(commissionTotal)}</strong></div>
          <div className="rendition-net-value"><span>Efectivo neto a rendir</span><strong>{new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(netToRemit)}</strong></div>
        </div>
        {hasUnconfiguredCommission && <p className="rendition-commission-warning">Hay juegos con ventas sin porcentaje configurado; para esos juegos se calcula 0%. Revisá la comisión del operador antes de confirmar.</p>}
        <button className="button primary" type={initialRendition ? "submit" : "button"}
          onClick={initialRendition ? undefined : () => {
            setConfirmationError("");
            if (batchMode) {
              if (!batchTickets.length || !receiptReviewed) {
                setConfirmationError("Agregá los cupones oficiales, revisá todos y marcá la confirmación antes de continuar.");
                setConfirmationOpen(true);
                return;
              }
              setDailyStatusChoice("complete");
            } else if (receiptData) {
              setReceiptReviewed(true);
              setReceiptData((previous) => previous ? { ...previous, userConfirmedReview: true } : previous);
              setDailyStatusChoice("complete");
            }
            setConfirmationOpen(true);
          }}
          disabled={!periodGames.length || !period || busy || total <= 0 || netToRemit <= 0 || Boolean(detectedPeriodMismatch) || (batchMode && (!batchTickets.length || !receiptReviewed))}>
          {busy ? "Leyendo ticket…" : initialRendition ? "Guardar cambios de la rendición" : batchMode ? "Confirmar rendición acumulada" : "Confirmar y guardar rendición"}
        </button>
      </div>

      {!initialRendition && confirmationOpen && (
        <div className="rendition-confirmation-overlay">
          <section
            className="rendition-confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={confirmationId + "-title"}
            aria-describedby={confirmationId + "-description"}
          >
            <div className="rendition-confirmation-heading">
              <p className="eyebrow">CONFIRMAR RENDICIÓN DIARIA</p>
              <h3 id={confirmationId + "-title"}>¿Cómo querés registrar esta rendición?</h3>
              <p id={confirmationId + "-description"} className="muted">
                Elegí el estado ahora. La rendición y el estado de este sorteo se guardarán juntos, sin alterar otros períodos.
              </p>
            </div>

            <div className="rendition-confirmation-options" role="radiogroup" aria-label="Estado diario">
              <label className={"rendition-confirmation-option" + (dailyStatusChoice === "complete" ? " is-selected" : "")}>
                <input
                  type="radio"
                  name={confirmationId + "-visible-status"}
                  checked={dailyStatusChoice === "complete"}
                  onChange={() => { setDailyStatusChoice("complete"); setConfirmationError(""); }}
                />
                <span>
                  <strong>Confirmar como rendida</strong>
                  <small>{canConfirmClosedTicket && !dailyCloseAllowed ? "El comprobante indica cierre y descarga confirmados; podés confirmar la jornada con este ticket." : dailyCloseAllowed ? "La rendición queda confirmada como completa para esta jornada." : "Se habilita después del último sorteo; aceptá el ticket oficial de cierre para confirmar antes."}</small>
                </span>
              </label>
              <label className={"rendition-confirmation-option" + (dailyStatusChoice === "incomplete" ? " is-selected" : "")}>
                <input
                  type="radio"
                  name={confirmationId + "-visible-status"}
                  checked={dailyStatusChoice === "incomplete"}
                  onChange={() => { setDailyStatusChoice("incomplete"); setConfirmationError(""); }}
                />
                <span>
                  <strong>Guardar como incompleta</strong>
                  <small>Indicá cuánto queda debiendo. Caja registrará como cobrado el efectivo neto menos esa deuda.</small>
                </span>
              </label>
            </div>

            {dailyStatusChoice === "incomplete" && (
              <div className="rendition-confirmation-fields">
                <label className="rendition-confirm-amount-label">
                  Monto pendiente por rendir
                  <input
                    type="number"
                    min="0.01"
                    max={Math.max(0, netToRemit - 0.01)}
                    step="0.01"
                    inputMode="decimal"
                    value={pendingAmount}
                    onChange={(event) => { setPendingAmount(event.target.value); setConfirmationError(""); }}
                    placeholder="Ej.: 12500.00"
                  />
                </label>
              </div>
            )}

            {confirmationError && <p className="message error-message rendition-confirmation-error" role="alert">{confirmationError}</p>}
            <div className="rendition-confirmation-actions">
              <button type="button" className="button ghost" onClick={() => setConfirmationOpen(false)}>
                Volver a revisar
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={busy}
              >
                {dailyStatusChoice === "complete" ? "Confirmar y registrar" : "Guardar incompleta"}
              </button>
            </div>
          </section>
        </div>
      )}

      <small className="muted">La fecha operativa se conserva en la rendición; las fechas y horarios impresos del ticket quedan en su detalle. Un cierre oficial aceptado puede confirmar la jornada antes del horario habitual.</small>
    </form>
  );
}
