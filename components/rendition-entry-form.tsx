"use client";

import { useEffect, useId, useMemo, useState } from "react";
import jsQR from "jsqr";
import { createAgencyRendition, updateAgencyRendition } from "@/app/(app)/agencias/actions";
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

function parseTicketText(text: string, games: Game[], recoveredPeriodNumber = "") {
  const receiptData = parseTicketClosure(text);
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

type ReceiptFocusRegion = "codes" | "agencyCode" | "subagentCode" | "subagentDigit1" | "subagentDigit0" | "subagentDigit2" | "machineCode" | "machineDigit0" | "machineDigit1" | "address" | "terminalId" | "printedAt" | "periodNumber" | "periodLabelled" | "periodLabelledTight" | "periodTail" | "periodGlyph1" | "periodGlyph2" | "periodGlyph3" | "periodGlyph4" | "periodGlyph5" | "periodGlyph6" | "periodGlyph7";
type ReceiptFocusSpec = { left:number; right:number; top:number; bottom:number; scale:number; contrast:number };
type ReceiptPaperBounds = { left:number; top:number; width:number; height:number };
type FocusedClosureMetadata = Partial<Pick<TicketClosureData,
  "agencyCode" | "subagentCode" | "machineCode" | "address" | "terminalId" | "printedAt" | "periodNumber"
>>;

const receiptFocusSpecs: Record<ReceiptFocusRegion, ReceiptFocusSpec> = {
  codes:       {left:0.030,right:0.955,top:0.263,bottom:0.292,scale:5,contrast:1.8},
  agencyCode:  {left:0.140,right:0.365,top:0.263,bottom:0.292,scale:6,contrast:1.8},
  // Recorte calibrado sobre el renglón impreso SUBAG:102. El valor está entre x≈0.53 y 0.61
  // del ancho del papel; terminar antes de MAQ evita capturar sus dígitos por error.
  subagentCode:{left:0.512,right:0.656,top:0.263,bottom:0.292,scale:6,contrast:1.6},
  // Un recorte por glifo, centrado respectivamente en 1, 0 y 2. Antes los recortes
  // segundo y tercero se solapaban con el glifo vecino y llegaban hasta la etiqueta MAQ.
  subagentDigit1:{left:0.522,right:0.556,top:0.263,bottom:0.292,scale:10,contrast:1.6},
  subagentDigit0:{left:0.568,right:0.602,top:0.263,bottom:0.292,scale:10,contrast:1.6},
  subagentDigit2:{left:0.613,right:0.651,top:0.263,bottom:0.292,scale:10,contrast:1.6},
  // MAQ: lectura de los dos glifos individuales; sin incluir los puntos del rótulo.
  machineCode: {left:0.775,right:0.879,top:0.263,bottom:0.292,scale:8,contrast:1.5},
  machineDigit0:{left:0.778,right:0.827,top:0.263,bottom:0.292,scale:10,contrast:1.4},
  machineDigit1:{left:0.828,right:0.875,top:0.263,bottom:0.292,scale:10,contrast:1.4},
  address:     {left:0.040,right:0.555,top:0.285,bottom:0.307,scale:5,contrast:1.8},
  // La máquina real está en su propia línea; no incluir la dirección que termina en 410.
  terminalId:  {left:0.362,right:0.534,top:0.3075,bottom:0.3295,scale:6,contrast:1.6},
  printedAt:   {left:0.035,right:0.965,top:0.324,bottom:0.347,scale:5,contrast:1.8},
  // Recortes estrechos: excluir el renglón ABIERTO que está justo debajo del período.
  periodNumber:{left:0.375,right:0.800,top:0.885,bottom:0.909,scale:10,contrast:1.5},
  periodLabelled:{left:0.022,right:0.830,top:0.885,bottom:0.909,scale:3,contrast:1.0},
  periodLabelledTight:{left:0.022,right:0.830,top:0.887,bottom:0.908,scale:3,contrast:1.0},
  periodTail:  {left:0.625,right:0.805,top:0.885,bottom:0.909,scale:11,contrast:1.5},
  // El número del cupón tiene siete casilleros de ancho fijo; se leen glifo por glifo.
  periodGlyph1:{left:0.375,right:0.414,top:0.885,bottom:0.909,scale:10,contrast:1.4},
  periodGlyph2:{left:0.425,right:0.463,top:0.885,bottom:0.909,scale:10,contrast:1.4},
  periodGlyph3:{left:0.473,right:0.513,top:0.885,bottom:0.909,scale:10,contrast:1.4},
  periodGlyph4:{left:0.523,right:0.561,top:0.885,bottom:0.909,scale:10,contrast:1.4},
  periodGlyph5:{left:0.571,right:0.610,top:0.885,bottom:0.909,scale:10,contrast:1.4},
  periodGlyph6:{left:0.622,right:0.659,top:0.885,bottom:0.909,scale:10,contrast:1.4},
  periodGlyph7:{left:0.670,right:0.707,top:0.885,bottom:0.909,scale:10,contrast:1.4},
};

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
  const columns=new Array<number>(scan.width).fill(0);
  for(let x=0;x<scan.width;x+=1){
    let total=0,count=0;
    for(let y=Math.floor(scan.height*.03);y<scan.height*.97;y+=2){
      const i=(y*scan.width+x)*4;
      total+=.299*pixels[i]!+.587*pixels[i+1]!+.114*pixels[i+2]!;count+=1;
    }
    columns[x]=count?total/count:0;
  }
  const horizontal=longestBrightRun(columns,150,scan.width*.06,scan.width*.98);
  if(!horizontal||horizontal.end-horizontal.start<scan.width*.34)return {left:0,top:0,width:bitmap.width,height:bitmap.height};
  const innerLeft=Math.round(horizontal.start+(horizontal.end-horizontal.start)*.04);
  const innerRight=Math.round(horizontal.end-(horizontal.end-horizontal.start)*.04);
  // El texto térmico divide el papel en franjas claras/oscuras; no usar esas franjas
  // como límites verticales. Mantener la altura completa evita desplazar los recortes OCR.
  const sx=bitmap.width/scan.width;
  const paperLeft=Math.max(0,Math.round(horizontal.start*sx));
  const paperWidth=Math.max(1,Math.min(bitmap.width,Math.round((horizontal.end-horizontal.start)*sx)));
  return {left:paperLeft,top:0,width:paperWidth,height:bitmap.height};
}

function makeReceiptFocusCrop(bitmap:ImageBitmap,bounds:ReceiptPaperBounds,region:ReceiptFocusRegion):HTMLCanvasElement {
  const spec=receiptFocusSpecs[region];
  const x=Math.max(0,Math.round(bounds.left+bounds.width*spec.left));
  const y=Math.max(0,Math.round(bounds.top+bounds.height*spec.top));
  const right=Math.min(bitmap.width,Math.round(bounds.left+bounds.width*spec.right));
  const bottom=Math.min(bitmap.height,Math.round(bounds.top+bounds.height*spec.bottom));
  const sw=Math.max(1,right-x),sh=Math.max(1,bottom-y);
  const scale=Math.max(1,Math.min(spec.scale,2800/Math.max(sw,sh)));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
  const context=canvas.getContext("2d",{willReadFrequently:true});
  if(!context)throw new Error("No se pudo preparar una zona del comprobante.");
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";
  context.drawImage(bitmap,x,y,sw,sh,0,0,canvas.width,canvas.height);
  const image=context.getImageData(0,0,canvas.width,canvas.height),data=image.data;
  for(let i=0;i<data.length;i+=4){
    const gray=.299*data[i]!+.587*data[i+1]!+.114*data[i+2]!;
    const v=Math.max(0,Math.min(255,(gray-128)*spec.contrast+128));
    data[i]=v;data[i+1]=v;data[i+2]=v;
  }
  // En los números del período, el papel térmico borroso convierte los ceros en bloques.
  // Un enfoque suave recupera los bordes sin binarizar ni borrar los trazos finos.
  if(region==="periodNumber"||region.startsWith("periodGlyph")||region==="machineDigit0"||region==="machineDigit1"||region==="agencyCode"||region==="subagentCode"||region==="machineCode"){
    const original=new Uint8ClampedArray(data);
    const width=canvas.width,height=canvas.height;
    for(let y=1;y<height-1;y+=1){
      for(let x=1;x<width-1;x+=1){
        const i=(y*width+x)*4;
        const center=original[i]!;
        const blur=(center+
          original[i-4]!+original[i+4]!+
          original[i-width*4]!+original[i+width*4]!+
          original[i-width*4-4]!+original[i-width*4+4]!+
          original[i+width*4-4]!+original[i+width*4+4]!+center*4)/13;
        const v=Math.max(0,Math.min(255,center+(center-blur)));
        data[i]=v;data[i+1]=v;data[i+2]=v;
      }
    }
  }
  context.putImageData(image,0,0);return canvas;
}

function makeThresholdOcrCrop(source:HTMLCanvasElement,threshold:number):HTMLCanvasElement {
  const canvas=document.createElement("canvas");
  canvas.width=source.width;canvas.height=source.height;
  const context=canvas.getContext("2d",{willReadFrequently:true});
  if(!context)throw new Error("No se pudo preparar la variante de OCR.");
  context.drawImage(source,0,0);
  const image=context.getImageData(0,0,canvas.width,canvas.height);
  const pixels=image.data;
  for(let i=0;i<pixels.length;i+=4){
    const gray=.299*pixels[i]!+.587*pixels[i+1]!+.114*pixels[i+2]!;
    const value=gray<threshold?0:255;
    pixels[i]=value;pixels[i+1]=value;pixels[i+2]=value;pixels[i+3]=255;
  }
  context.putImageData(image,0,0);
  return canvas;
}

async function makeFocusedReceiptCrops(file:File) {
  const bitmap=await createImageBitmap(file);
  try {
    const bounds=detectReceiptPaperBounds(bitmap);
    const crops={
      codes:makeReceiptFocusCrop(bitmap,bounds,"codes"),
      agencyCode:makeReceiptFocusCrop(bitmap,bounds,"agencyCode"),
      subagentCode:makeReceiptFocusCrop(bitmap,bounds,"subagentCode"),
      subagentDigit1:makeReceiptFocusCrop(bitmap,bounds,"subagentDigit1"),
      subagentDigit0:makeReceiptFocusCrop(bitmap,bounds,"subagentDigit0"),
      subagentDigit2:makeReceiptFocusCrop(bitmap,bounds,"subagentDigit2"),
      machineCode:makeReceiptFocusCrop(bitmap,bounds,"machineCode"),
      machineDigit0:makeReceiptFocusCrop(bitmap,bounds,"machineDigit0"),
      machineDigit1:makeReceiptFocusCrop(bitmap,bounds,"machineDigit1"),
      address:makeReceiptFocusCrop(bitmap,bounds,"address"),
      terminalId:makeReceiptFocusCrop(bitmap,bounds,"terminalId"),
      printedAt:makeReceiptFocusCrop(bitmap,bounds,"printedAt"),
      periodNumber:makeReceiptFocusCrop(bitmap,bounds,"periodNumber"),
      periodLabelled:makeReceiptFocusCrop(bitmap,bounds,"periodLabelled"),
      periodLabelledTight:makeReceiptFocusCrop(bitmap,bounds,"periodLabelledTight"),
      periodTail:makeReceiptFocusCrop(bitmap,bounds,"periodTail"),
      periodGlyphs:[
        makeReceiptFocusCrop(bitmap,bounds,"periodGlyph1"),
        makeReceiptFocusCrop(bitmap,bounds,"periodGlyph2"),
        makeReceiptFocusCrop(bitmap,bounds,"periodGlyph3"),
        makeReceiptFocusCrop(bitmap,bounds,"periodGlyph4"),
        makeReceiptFocusCrop(bitmap,bounds,"periodGlyph5"),
        makeReceiptFocusCrop(bitmap,bounds,"periodGlyph6"),
        makeReceiptFocusCrop(bitmap,bounds,"periodGlyph7"),
      ],
    };
    return {
      ...crops,
      codesThreshold140:makeThresholdOcrCrop(crops.codes,140),
      codesThreshold170:makeThresholdOcrCrop(crops.codes,170),
      codesThreshold175:makeThresholdOcrCrop(crops.codes,175),
      agencyCodeThreshold160:makeThresholdOcrCrop(crops.agencyCode,160),
      agencyCodeThreshold175:makeThresholdOcrCrop(crops.agencyCode,175),
      agencyCodeThreshold185:makeThresholdOcrCrop(crops.agencyCode,185),
      agencyCodeThreshold195:makeThresholdOcrCrop(crops.agencyCode,195),
      machineCodeThreshold140:makeThresholdOcrCrop(crops.machineCode,140),
      machineCodeThreshold160:makeThresholdOcrCrop(crops.machineCode,160),
      machineCodeThreshold175:makeThresholdOcrCrop(crops.machineCode,175),
      machineCodeThreshold185:makeThresholdOcrCrop(crops.machineCode,185),
      periodLabelledThreshold140:makeThresholdOcrCrop(crops.periodLabelled,140),
      periodLabelledThreshold160:makeThresholdOcrCrop(crops.periodLabelled,160),
      periodLabelledThreshold170:makeThresholdOcrCrop(crops.periodLabelled,170),
      periodLabelledThreshold175:makeThresholdOcrCrop(crops.periodLabelled,175),
      periodLabelledTightThreshold160:makeThresholdOcrCrop(crops.periodLabelledTight,160),
      subagentCodeThreshold140:makeThresholdOcrCrop(crops.subagentCode,140),
      subagentCodeThreshold160:makeThresholdOcrCrop(crops.subagentCode,160),
      subagentCodeThreshold170:makeThresholdOcrCrop(crops.subagentCode,170),
      subagentCodeThreshold175:makeThresholdOcrCrop(crops.subagentCode,175),
      periodNumberThreshold140:makeThresholdOcrCrop(crops.periodNumber,140),
      periodNumberThreshold160:makeThresholdOcrCrop(crops.periodNumber,160),
      periodNumberThreshold170:makeThresholdOcrCrop(crops.periodNumber,170),
      periodNumberThreshold175:makeThresholdOcrCrop(crops.periodNumber,175),
      periodTailThreshold140:makeThresholdOcrCrop(crops.periodTail,140),
      periodTailThreshold175:makeThresholdOcrCrop(crops.periodTail,175),
    };
  } finally { bitmap.close(); }
}

function ocrDigitSequence(value:string,mapBoxedZero=false):string {
  let text=normalize(value).toUpperCase().replace(/\s+/g,"").replace(/[OQ]/g,"0").replace(/[IL|!]/g,"1");
  if(mapBoxedZero)text=text.replace(/[BDGCEA]/g,"0").replace(/Z/g,"2");
  return text.replace(/\D/g,"");
}
function numericSequenceInSegment(value:string):string {
  const groups=value.toUpperCase().match(/[0-9OQILZBDGCEA](?:[\s.:_-]*[0-9OQILZBDGCEA]){0,7}/g)??[];
  return groups.map((s)=>ocrDigitSequence(s,true)).filter((s)=>s.length>0&&s.length<=8).sort((a,b)=>b.length-a.length)[0]??"";
}
function labelledNumberSegment(line:string,startLabels:RegExp[],stopLabels:RegExp[]):string {
  const text=normalize(line).replace(/\s+/g," ").toUpperCase();
  const starts=startLabels.map((pattern)=>{const m=text.match(pattern);return m&&m.index!==undefined?{index:m.index,length:m[0].length}:null;})
    .filter((v):v is {index:number;length:number}=>v!==null).sort((a,b)=>a.index-b.index);
  const start=starts[0];if(!start)return "";
  const from=start.index+start.length;let to=text.length;
  for(const pattern of stopLabels){const m=text.slice(from).match(pattern);if(m&&m.index!==undefined)to=Math.min(to,from+m.index);}
  return text.slice(from,to);
}
function readFocusedCodes(codesText:string,agencyDigitsText:string,machineDigitsText:string) {
  const agencyLabels=[/\bAGENCIA\s*[:.]/i,/\bAG\s*[:.]/i,/\bAB\s*[:.]/i,/\bA[BG86]\s*[:.]/i];
  const subagentLabels=[/\bSUBAG(?:ENTE)?\s*[:.]/i,/\bSUBA?G\s*[:.]/i,/\bSUA\s*[:.]/i,/\bSIEAG\s*[:.]/i,/\bSILAG\s*[:.]/i,/\bS[UI1]B?A?G\s*[:.]/i,/\bS[UI1]E?A?G\s*[:.]/i];
  const machineLabels=[/\bMAQUINA\s*[:.]/i,/\bMAQ\s*[:.]/i,/\bM0+\s*[:.]/i,/\bMAO\s*[:.]/i,/\bM[A4][QOD0]\s*[:.]/i,/\bH[A4][VD]\s*[:.]/i,/\bN[A4]D\s*[:.]/i];
  let agency=numericSequenceInSegment(labelledNumberSegment(codesText,agencyLabels,[...subagentLabels,...machineLabels]));
  const subagent=numericSequenceInSegment(labelledNumberSegment(codesText,subagentLabels,machineLabels));
  let machine=numericSequenceInSegment(labelledNumberSegment(codesText,machineLabels,[]));
  if(agency)agency=agency.length<4?agency.padStart(4,"0"):agency.slice(-4);
  if(machine)machine=machine.length<2?machine.padStart(2,"0"):machine.slice(-2);
  return {agencyCode:agency||null,subagentCode:subagent||null,machineCode:machine||null};
}
function readFocusedAddress(values:string[],fallback:string|null):string|null {
  for(const value of values){
    const text=normalize(value).replace(/\s+/g," ").trim();if(!text)continue;
    const number=[...text.matchAll(/\b\d{1,5}\b/g)].at(-1)?.[0]??null;
    if(number&&/\b(?:RIOJA|RIOJ|RIGT?A|RIGIA|RITA|RIUTA)\b/i.test(text))return "LA RIOJA N.º "+number;
    if(number&&/\b(?:CALLE|AVENIDA|AV\.?|RUTA|DOMICILIO|DIRECCION)\b/i.test(text))return value.trim();
  }
  return fallback;
}
function readFocusedPrintedAt(values:string[]):TicketClosureData["printedAt"]|null {
  for(const raw of values){
    const text=raw.replace(/\s+/g," ").trim();
    const date=text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)?.[1]??null;
    const time=text.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/)?.[1]??null;
    if(!date||!time)continue;
    const d=date.split(/[/-]/).map(Number),t=time.split(":").map(Number);
    if(d.length!==3||(d[0]??0)<1||(d[0]??0)>31||(d[1]??0)<1||(d[1]??0)>12||
      t.length<2||(t[0]??-1)<0||(t[0]??99)>23||(t[1]??-1)<0||(t[1]??99)>59||
      (t[2]!==undefined&&(t[2]<0||t[2]>59)))continue;
    return {date,time,raw:date+" "+time};
  }
  return null;
}
function normalizePrintedPeriodGlyphs(raw:string):string|null {
  const token=raw.toUpperCase().replace(/[^0-9A-Z|!]/g,"");
  if(token.length<3||token.length>7)return null;
  const hasOcrLetters=/[A-Z|!]/.test(token);
  const digits=[...token].map((char,index)=>{
    if(/[OQBDGCEAH]/.test(char))return "0";
    if(/[IL|!]/.test(char))return "1";
    if(char==="Z")return "2";
    if(char==="8"&&index===0&&hasOcrLetters)return "0";
    return /^[0-9]$/.test(char)?char:"";
  }).join("");
  if(!/^\d{3,7}$/.test(digits))return null;
  return digits.padStart(7,"0");
}
function readLabelledPeriodNumber(values:string[],confirmedTail:string|null=null):string|null {
  const candidates:string[]=[];
  for(const raw of values){
    const text=raw.toUpperCase().replace(/\s+/g," ").trim();
    const labelPattern=/P\s*E?\s*R\s*[I1LYN]?\s*[O0Q8GHN]?\s*D\s*[O0Q8GHY]?/i;
    const label=labelPattern.exec(text);
    if(!label||label.index===undefined)continue;
    let suffix=text.slice(label.index+label[0].length);
    suffix=suffix.replace(/^\s*[\s:.,_\-).#º°]*(?:NRO|NR0|GRO|GR0|RNO|RN0|ARO|AR0|ORO|OR0|RO|R0|NO|N[º°.]?)\s*[\s:.,_\-).#º°]*/i," ");
    // Reconocer los dígitos aunque estén separados por espacios o puntos en la lectura térmica.
    const tokens=suffix.match(/[0-9OQIL|!BDGCEAZH8](?:[\s.:_-]*[0-9OQIL|!BDGCEAZH8]){3,6}/g)??[];
    for(const token of tokens){
      const digits=normalizePrintedPeriodGlyphs(token);
      if(!digits||digits==="0000000")continue;
      candidates.push(digits);
      break;
    }
  }
  const counts=new Map<string,number>();
  for(const value of candidates)counts.set(value,(counts.get(value)??0)+1);
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(confirmedTail){
    const matches=ranked.filter(([value])=>value.endsWith(confirmedTail));
    if(matches.length){
      const best=matches[0]!;
      if(matches.length===1||best[1]>(matches[1]?.[1]??0))return best[0];
    }
  }
  if(!ranked[0]||ranked[0][1]<2||(ranked[1]&&ranked[1][1]===ranked[0][1]))return null;
  return ranked[0][0];
}
function looksLikeZeroGlyph(canvas: HTMLCanvasElement, luminanceThreshold = 180): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  const { width, height, data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const xMargin = Math.max(1, Math.floor(width * 0.05));
  const yStart = Math.floor(height * 0.10);
  const yEnd = Math.ceil(height * 0.90);
  const edgeWidth = Math.max(2, Math.floor(width * 0.30));
  const centerStart = Math.floor(width * 0.40);
  const centerEnd = Math.ceil(width * 0.60);
  let leftDark = 0, rightDark = 0, centerDark = 0, rowCount = 0, bothEdgeRows = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    let leftRow = 0, rightRow = 0, centerRow = 0;
    for (let x = xMargin; x < Math.min(width, xMargin + edgeWidth); x += 1) {
      const i = (y * width + x) * 4;
      if (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]! < luminanceThreshold) leftRow += 1;
    }
    for (let x = Math.max(0, width - xMargin - edgeWidth); x < width - xMargin; x += 1) {
      const i = (y * width + x) * 4;
      if (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]! < luminanceThreshold) rightRow += 1;
    }
    for (let x = centerStart; x < centerEnd; x += 1) {
      const i = (y * width + x) * 4;
      if (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]! < luminanceThreshold) centerRow += 1;
    }
    const leftFraction = leftRow / edgeWidth;
    const rightFraction = rightRow / edgeWidth;
    const centerFraction = centerRow / Math.max(1, centerEnd - centerStart);
    leftDark += leftFraction; rightDark += rightFraction; centerDark += centerFraction; rowCount += 1;
    if (leftFraction > 0.16 && rightFraction > 0.16) bothEdgeRows += 1;
  }
  if (!rowCount) return false;
  const leftMean = leftDark / rowCount;
  const rightMean = rightDark / rowCount;
  const centerMean = centerDark / rowCount;
  const closedSideRows = bothEdgeRows / rowCount;
  return leftMean > 0.19 && rightMean > 0.19 && closedSideRows > 0.38 &&
    centerMean < Math.min(leftMean, rightMean) * 0.84;
}

function readSingleDigitGlyph(raw: string): string | null {
  const token = raw.toUpperCase().replace(/[^0-9OQIL|!Z]/g, "");
  if (token.length !== 1) return null;
  const char = token[0]!;
  if (/^[0-9]$/.test(char)) return char;
  if (/[OQ]/.test(char)) return "0";
  if (/[IL|!]/.test(char)) return "1";
  if (char === "Z") return "2";
  return null;
}

function readFocusedPeriodNumber(labelledValues:string[],digitValues:string[],confirmedTail:string|null):string|null {
  const periodLabel=/P\s*E?\s*R\s*[I1LYN]?\s*[O0Q8GHN]?\s*D/i;
  const labelWasRead=labelledValues.some((value)=>periodLabel.test(value.toUpperCase()));
  if(!labelWasRead||!confirmedTail||!/^\d{2}$/.test(confirmedTail))return null;

  const candidates:string[]=[];
  for(const raw of digitValues){
    const tokens=raw.toUpperCase().match(/[0-9OQIL|!BDGCEAZH8]{3,7}/g)??[];
    for(const token of tokens){
      const normalized=normalizePrintedPeriodGlyphs(token);
      if(!normalized||normalized==="0000000"||!normalized.endsWith(confirmedTail))continue;
      candidates.push(normalized);
    }
  }
  const counts=new Map<string,number>();
  for(const candidate of candidates)counts.set(candidate,(counts.get(candidate)??0)+1);
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  // If threshold variants disagree, leave the field empty instead of showing a number from elsewhere.
  if(ranked[0]&&(!ranked[1]||ranked[0][1]>ranked[1][1]))return ranked[0][0];
  return null;
}
function readFocusedDigitValue(values:string[],minimumLength:number,maximumLength=10):string|null {
  const candidates=values
    .map((value)=>ocrDigitSequence(value,true))
    .filter((value)=>value.length>=minimumLength&&value.length<=maximumLength);
  if(!candidates.length)return null;
  const counts=new Map<string,number>();for(const value of candidates)counts.set(value,(counts.get(value)??0)+1);
  return candidates.sort((a,b)=>(counts.get(b)??0)-(counts.get(a)??0)||b.length-a.length)[0]??null;
}

function readFocusedAgencyCode(values:string[]):string|null {
  const rawCandidates:string[]=[];
  for(const raw of values){
    const tokens=raw.toUpperCase().match(/[0-9OQIL|!BDGCEAZH]{3,4}/g)??[];
    for(const token of tokens){
      let digits=ocrDigitSequence(token,true);
      if(digits.length===3)digits=digits.padStart(4,"0");
      if(/^\d{4}$/.test(digits))rawCandidates.push(digits);
    }
  }
  if(!rawCandidates.length)return null;
  const hasLeadingZero=new Set(rawCandidates.filter(v=>v.startsWith("0")).map(v=>v.slice(1)));
  const candidates=rawCandidates.map(v=>v.startsWith("1")&&hasLeadingZero.has(v.slice(1))?"0"+v.slice(1):v);
  const counts=new Map<string,number>();
  for(const value of candidates)counts.set(value,(counts.get(value)??0)+1);
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(ranked.length>1&&ranked[0]![1]===ranked[1]![1]){
    return ranked.find(([value])=>value.startsWith("0"))?.[0]??null;
  }
  return ranked[0]?.[0]??null;
}

function readSubagentCandidate(raw:string):string|null {
  const upper=raw.toUpperCase().trim();
  // Los recortes SUBAG son solo el valor impreso; quitar el rótulo si el OCR lo devuelve.
  const labelled=upper.match(/(?:SUBAG(?:ENTE)?|SUBA?G|S[UI1]B?A?G)\s*[:.]?\s*(.*)$/);
  const value=(labelled?.[1] ?? upper).trim();
  // El campo contiene tres dígitos. No permitir que 4/5 cifras de una línea vecina pasen.
  const candidates=[...value.matchAll(/(?:^|[^A-Z0-9])([0-9OQIL|!](?:[\s.:_-]*[0-9OQIL|!]){2})(?=$|[^A-Z0-9])/g)];
  for(const match of candidates){
    const digits=(match[1]??"").replace(/[\s.:_-]/g,"").replace(/[OQ]/g,"0").replace(/[IL|!]/g,"1");
    if(/^\d{3}$/.test(digits))return digits;
  }
  // Algunas pasadas devuelven únicamente el valor, sin etiqueta ni separadores.
  const compact=value.replace(/\s+/g,"");
  if(/^[0-9OQIL|!]{3}$/.test(compact)){
    const digits=compact.replace(/[OQ]/g,"0").replace(/[IL|!]/g,"1");
    return /^\d{3}$/.test(digits)?digits:null;
  }
  return null;
}
function readFocusedSubagentCode(values:string[]):string|null {
  const candidates=values.map(readSubagentCandidate).filter((value):value is string=>Boolean(value));
  const counts=new Map<string,number>();
  for(const candidate of candidates)counts.set(candidate,(counts.get(candidate)??0)+1);
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(ranked[0]&&ranked[0][1]>=2&&(!ranked[1]||ranked[0][1]>ranked[1][1]))return ranked[0][0];
  return null;
}
function readFocusedMachineCode(digitValues:string[]):string|null {
  // MAQ tiene dos glifos impresos ("01"). Ignorar letras sueltas y secuencias largas
  // que podrían venir de la dirección o de Máquina real.
  const direct:string[]=[];
  for(const raw of digitValues){
    const token=raw.toUpperCase().replace(/[^0-9OQIL|!BDGCEAZH]/g,"");
    if(token.length!==2)continue;
    const digits=token.replace(/[OQBDGCEAH]/g,"0").replace(/[IL|!]/g,"1").replace(/Z/g,"2");
    if(/^\d{2}$/.test(digits))direct.push(digits);
  }
  const counts=new Map<string,number>();
  for(const value of direct)counts.set(value,(counts.get(value)??0)+1);
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  return ranked[0]&&(!ranked[1]||ranked[0][1]>ranked[1][1])?ranked[0][0]:null;
}
function periodDigits(raw:string):string {
  return raw.toUpperCase().replace(/[^0-9OQIL|!BDGCEAZH]/g,"")
    .replace(/[OQBDGCEAH]/g,"0").replace(/[IL|!]/g,"1").replace(/Z/g,"2");
}

function readPeriodTail(values:string[]):string|null {
  const candidates:string[]=[];
  for(const raw of values){
    const tokens=raw.toUpperCase().match(/[0-9OQIL|!BDGCEAZH]{2,}/g)??[];
    for(const token of tokens){
      const digits=token.replace(/[OQBDGCEAH]/g,"0").replace(/[IL|!]/g,"1").replace(/Z/g,"2").replace(/\D/g,"");
      if(digits.length>=2)candidates.push(digits.slice(-2));
    }
  }
  const counts=new Map<string,number>();
  for(const value of candidates)counts.set(value,(counts.get(value)??0)+1);
  const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(!ranked[0])return null;
  if(ranked[1]&&ranked[0][1]===ranked[1][1])return null;
  return ranked[0][0];
}
export function RenditionEntryForm({ agentId, games, today, periods, allPeriods, defaultPeriod, initialRendition, dailyMode = false, dailyCloseAllowed = true }: { agentId: string; games: Game[]; today: string; periods: OfficialDrawPeriod[]; allPeriods?: OfficialDrawPeriod[]; defaultPeriod?: string; initialRendition?: InitialRendition; dailyMode?: boolean; dailyCloseAllowed?: boolean }) {
  const [mode, setMode] = useState<"photo" | "manual">(initialRendition?.captureMethod === "manual" ? "manual" : "photo");
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
  const [gameListExpanded, setGameListExpanded] = useState(false);
  const [receiptReviewed, setReceiptReviewed] = useState(Boolean(initialRendition?.receiptData?.userConfirmedReview));
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
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [dailyStatusChoice, setDailyStatusChoice] = useState<"complete" | "incomplete">(dailyMode && !dailyCloseAllowed ? "incomplete" : "complete");
  const [reportedAmount, setReportedAmount] = useState("");

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
  const canConfirmDaily = dailyCloseAllowed || canConfirmClosedTicket;

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
      detectedQr = (await readQrFromImage(file)) ?? "";
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
          if (target) setAmounts((previous) => ({ ...previous, [target.id]: qr.amount!.toFixed(2) }));
        }
      }

      setProgress("Leyendo el texto del ticket…");
      setProgressPercent(18);
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("spa+eng", 1, {
        logger: (message) => {
          if (message.status === "recognizing text" && typeof message.progress === "number") {
            const percent = Math.min(96, 18 + Math.round(message.progress * 78));
            setProgressPercent(percent);
            setProgress("Reconociendo ticket…");
          }
        },
      });
      let recognizedText = "";
      let recoveredPeriodNumber = "";
      let focusedClosureMetadata: FocusedClosureMetadata = {};
      let focusedOcrDebugText = "";
      try {
        const result = await worker.recognize(file);
        recognizedText = result.data.text ?? "";

        // La pasada general sigue siendo la fuente de importes. Se conserva el segundo
        // intento anterior solo como alternativa de texto general.
        const closureCandidate = Boolean(parseTicketClosure(recognizedText)) ||
          /\bFIN\s+DE\s+(?:JOR|TOR)NADA\b/i.test(normalize(recognizedText)) ||
          /\bTOTALES?\s+EN\s+T[J7I1]\b/i.test(normalize(recognizedText));
        if (closureCandidate) {
          setProgress("Leyendo los datos impresos del FIN DE JORNADA…");
          setProgressPercent(72);
          const crops = await makeFocusedReceiptCrops(file);
          const setOcrMode = async (mode:number, whitelist?:string) => {
            await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:whitelist ?? ""} as any);
          };

          // Lectura enfocada reducida: dos lecturas de la franja de identificadores
          // para confirmar SUBAG/MAQ, y una por cada campo independiente. Evita decenas
          // de pasadas sobre variantes del mismo recorte.
          await setOcrMode(6);
          const codesLine6 = (await worker.recognize(crops.codes)).data.text ?? "";
          await setOcrMode(7);
          const codesLine7 = (await worker.recognize(crops.codes)).data.text ?? "";
          const codesLineThreshold170 = (await worker.recognize(crops.codesThreshold170)).data.text ?? "";
          const codeRead6 = readFocusedCodes(codesLine6,"","");
          const codeRead7 = readFocusedCodes(codesLine7,"","");
          const codeReadThreshold170 = readFocusedCodes(codesLineThreshold170,"","");
          // Leer AG, SUBAG y MAQ en recortes independientes. Antes se generaban los recortes
          // de AG/MAQ pero sus resultados no se utilizaban para rellenar esos campos.
          const digitWhitelist = "0123456789OQILBDGCEA";
          await setOcrMode(7,digitWhitelist);
          const agencyCropRaw7 = (await worker.recognize(crops.agencyCode)).data.text ?? "";
          await setOcrMode(7,"0123456789OQIL");
          const subagentCropRaw7 = (await worker.recognize(crops.subagentCode)).data.text ?? "";
          await setOcrMode(7,digitWhitelist);
          const machineCropRaw7 = (await worker.recognize(crops.machineCode)).data.text ?? "";
          // PSM 7 acierta "01" en el recorte MAQ de esta foto; PSM 8 lo confunde con letras.
          const machineCrop140 = (await worker.recognize(crops.machineCodeThreshold140)).data.text ?? "";
          const machineCrop160 = (await worker.recognize(crops.machineCodeThreshold160)).data.text ?? "";
          const machineCrop175 = (await worker.recognize(crops.machineCodeThreshold175)).data.text ?? "";
          const machineCrop185 = (await worker.recognize(crops.machineCodeThreshold185)).data.text ?? "";

          await setOcrMode(8,digitWhitelist);
          const agencyCrop160 = (await worker.recognize(crops.agencyCodeThreshold160)).data.text ?? "";
          const agencyCrop175 = (await worker.recognize(crops.agencyCodeThreshold175)).data.text ?? "";
          const agencyCrop185 = (await worker.recognize(crops.agencyCodeThreshold185)).data.text ?? "";
          const agencyCrop195 = (await worker.recognize(crops.agencyCodeThreshold195)).data.text ?? "";
          // Las cuatro variantes de SUBAG se leen con whitelist numérica: el campo es solo 3 dígitos.
          await setOcrMode(8,"0123456789OQIL");
          const subagentCrop140 = (await worker.recognize(crops.subagentCodeThreshold140)).data.text ?? "";
          const subagentCrop160 = (await worker.recognize(crops.subagentCodeThreshold160)).data.text ?? "";
          const subagentCrop170 = (await worker.recognize(crops.subagentCodeThreshold170)).data.text ?? "";
          const subagentCrop175 = (await worker.recognize(crops.subagentCodeThreshold175)).data.text ?? "";
          // PSM 13 distingue el cero cuadrado en el centro de SUBAG:102; PSM 10 lo confundía con 1.
          await setOcrMode(13,"0123456789OQIL");
          const subagentGlyph1Raw = (await worker.recognize(crops.subagentDigit1)).data.text ?? "";
          const subagentGlyph0Raw = (await worker.recognize(crops.subagentDigit0)).data.text ?? "";
          const subagentGlyph2Raw = (await worker.recognize(crops.subagentDigit2)).data.text ?? "";
          const subagentGlyph1 = readSingleDigitGlyph(subagentGlyph1Raw);
          const subagentGlyph0 = looksLikeZeroGlyph(crops.subagentDigit0,140) ? "0" : readSingleDigitGlyph(subagentGlyph0Raw);
          const subagentGlyph2 = readSingleDigitGlyph(subagentGlyph2Raw);
          const subagentFromIndividualGlyphs = subagentGlyph1 && subagentGlyph0 && subagentGlyph2
            ? subagentGlyph1 + subagentGlyph0 + subagentGlyph2
            : null;
          await setOcrMode(8,digitWhitelist);
          const focusedAgency = readFocusedAgencyCode([agencyCropRaw7,agencyCrop160,agencyCrop175,agencyCrop185,agencyCrop195])
            ?? codeRead7.agencyCode ?? codeRead6.agencyCode;
          const validSubagentCode = (value:string|null|undefined) => value && /^\d{3}$/.test(value) ? value : null;
          const subagentFrom140 = readSubagentCandidate(subagentCrop140);
          const subagentFrom160 = readSubagentCandidate(subagentCrop160);
          const cropConsensusSubagent = readFocusedSubagentCode([subagentCropRaw7,subagentCrop140,subagentCrop160,subagentCrop170,subagentCrop175]);
          // Para SUBAG solo aceptar consenso de la franja independiente, nunca cifras del renglón completo.
          const focusedSubagent = subagentFromIndividualGlyphs ??
            cropConsensusSubagent ??
            (subagentFrom140 && subagentFrom140 === subagentFrom160 ? subagentFrom140 : null);

          await setOcrMode(10,digitWhitelist);
          const machineTensIsZero = looksLikeZeroGlyph(crops.machineDigit0);
          const machineTensRaw = machineTensIsZero ? "" : (await worker.recognize(crops.machineDigit0)).data.text ?? "";
          const machineUnitsRaw = (await worker.recognize(crops.machineDigit1)).data.text ?? "";
          const machineTens = machineTensIsZero ? "0" : readSingleDigitGlyph(machineTensRaw);
          const machineUnits = readSingleDigitGlyph(machineUnitsRaw);
          const isolatedMachine = machineTens && machineUnits ? machineTens + machineUnits : null;
          const focusedMachine = isolatedMachine ?? readFocusedMachineCode([machineCropRaw7,machineCrop140,machineCrop160,machineCrop175,machineCrop185]) ??
            codeReadThreshold170.machineCode ?? codeRead7.machineCode ?? codeRead6.machineCode;

          await setOcrMode(6);
          const addressLine = (await worker.recognize(crops.address)).data.text ?? "";
          const printedLine = (await worker.recognize(crops.printedAt)).data.text ?? "";
          const terminalLine = (await worker.recognize(crops.terminalId)).data.text ?? "";

          // Tres lecturas, todas sobre el renglón «Periodo nro», no sobre la página completa.
          // Dos recortes usan umbral 160 y PSM 8; el tercero verifica el trazo a umbral 170.
          await setOcrMode(8);
          const periodLineWide160 = (await worker.recognize(crops.periodLabelledThreshold160)).data.text ?? "";
          const periodLineTight160 = (await worker.recognize(crops.periodLabelledTightThreshold160)).data.text ?? "";
          await setOcrMode(6);
          const periodLineWide170 = (await worker.recognize(crops.periodLabelledThreshold170)).data.text ?? "";
          await setOcrMode(8,"0123456789OQILBDGCEAZH");
          const periodDigitsRaw = (await worker.recognize(crops.periodNumber)).data.text ?? "";
          const periodDigits140 = (await worker.recognize(crops.periodNumberThreshold140)).data.text ?? "";
          const periodDigits160 = (await worker.recognize(crops.periodNumberThreshold160)).data.text ?? "";
          const periodDigits170 = (await worker.recognize(crops.periodNumberThreshold170)).data.text ?? "";
          const periodDigits175 = (await worker.recognize(crops.periodNumberThreshold175)).data.text ?? "";
          const periodTail140 = (await worker.recognize(crops.periodTailThreshold140)).data.text ?? "";
          const periodTail175 = (await worker.recognize(crops.periodTailThreshold175)).data.text ?? "";
          const focusedPeriodTail = readPeriodTail([periodTail140,periodTail175]);
          // El cierre ya se reconoció como FIN DE JORNADA y este recorte está en la fila fija
          // "Periodo nro"; el OCR puede deformar las letras del rótulo.
          const periodLabelConfirmed = closureCandidate;
          const periodGlyphRaw: string[] = [];
          const periodGlyphDigits: string[] = [];
          await setOcrMode(10,digitWhitelist);
          for (const glyph of crops.periodGlyphs) {
            if (looksLikeZeroGlyph(glyph,140)) {
              periodGlyphRaw.push("[cero por forma]");
              periodGlyphDigits.push("0");
              continue;
            }
            const firstRead = (await worker.recognize(glyph)).data.text ?? "";
            let digit = readSingleDigitGlyph(firstRead);
            let rawRead = firstRead;
            if (!digit) {
              await setOcrMode(13,digitWhitelist);
              rawRead = (await worker.recognize(glyph)).data.text ?? "";
              digit = readSingleDigitGlyph(rawRead);
              await setOcrMode(10,digitWhitelist);
            }
            periodGlyphRaw.push(rawRead.trim());
            periodGlyphDigits.push(digit ?? "");
          }
          const periodFromIndividualGlyphs = periodLabelConfirmed && periodGlyphDigits.length === 7 &&
            periodGlyphDigits.every((value)=>/^\d$/.test(value))
            ? periodGlyphDigits.join("")
            : null;
          const rejectedWholeNumberCandidate = readFocusedPeriodNumber(
            [periodLineWide160,periodLineTight160,periodLineWide170],
            [periodDigitsRaw,periodDigits140,periodDigits160,periodDigits170,periodDigits175],
            focusedPeriodTail
          );
          // Los siete glifos alineados con sus casilleros son la fuente de verdad.
          // La lectura de la línea completa confundía los ceros cuadrados y daba 0100011.
          const focusedPeriod = periodFromIndividualGlyphs;
          const focusedTerminal = readFocusedDigitValue([terminalLine],4,6);
          const focusedPrint = readFocusedPrintedAt([printedLine]);
          const focusedAddress = readFocusedAddress([addressLine],null);
          focusedClosureMetadata = {
            agencyCode: focusedAgency ?? undefined,
            subagentCode: focusedSubagent ?? undefined,
            machineCode: focusedMachine ?? undefined,
            address: focusedAddress ?? undefined,
            terminalId: focusedTerminal ?? undefined,
            printedAt: focusedPrint ?? undefined,
            periodNumber: focusedPeriod ?? undefined,
          };
          recoveredPeriodNumber = focusedPeriod ?? "";
          focusedOcrDebugText = [
            "[LECTURA FOCALIZADA FIN DE JORNADA]",
            "Identificadores (PSM 6): " + codesLine6.trim(),
            "Identificadores (PSM 7): " + codesLine7.trim(),
            "Dirección: " + addressLine.trim(),
            "Máquina real: " + terminalLine.trim(),
            "Impresión: " + printedLine.trim(),
            "AG recortes: " + [agencyCropRaw7,agencyCrop160,agencyCrop175,agencyCrop185,agencyCrop195].map((v)=>v.trim()).join(" / "),
            "SUBAG glifos: " + [subagentGlyph1Raw,subagentGlyph0Raw,subagentGlyph2Raw].map((v)=>v.trim()).join(" | ") + " => " + (subagentFromIndividualGlyphs ?? "sin lectura segura"),
            "SUBAG recortes: " + [subagentCropRaw7,subagentCrop160,subagentCrop170,subagentCrop175].map((v)=>v.trim()).join(" / "),
            "MAQ recortes: " + [machineCropRaw7,machineCrop140,machineCrop160,machineCrop175,machineCrop185].map((v)=>v.trim()).join(" / "),
            "Renglón de códigos 170: " + codesLineThreshold170.trim(),
            "Cola de período: " + [periodTail140,periodTail175].map((v)=>v.trim()).join(" / "),
            "Período solo dígitos: " + [periodDigitsRaw,periodDigits140,periodDigits160,periodDigits170,periodDigits175].map((v)=>v.trim()).join(" / "),
            "Período rotulado 160 ancho: " + periodLineWide160.trim(),
            "Período rotulado 160 ajustado: " + periodLineTight160.trim(),
            "Período rotulado 170: " + periodLineWide170.trim(),
            "Período por glifo: " + periodGlyphDigits.join("") + " (OCR: " + periodGlyphRaw.join("|") + ")",
            "Período final por siete glifos: " + (focusedPeriod ?? "sin lectura segura") + "; OCR de línea descartado: " + (rejectedWholeNumberCandidate ?? "sin lectura segura"),
          ].join("\n");
        }
      } finally {
        await worker.terminate();
      }

      setOcrText([recognizedText, focusedOcrDebugText].filter(Boolean).join("\n\n"));
      const activeGames = games.filter((game) => game.enabled !== false);
      const parsed = parseTicketText(recognizedText, activeGames, recoveredPeriodNumber);
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
        const labelledPeriod = validPeriod(focusedClosureMetadata.periodNumber);
        const validSubagent = (value: string | null | undefined) => {
          const digits = String(value ?? "").replace(/\D/g, "");
          return /^\d{3}$/.test(digits) ? digits : null;
        };
        const closureReceipt = {
          ...parsed.receiptData,
          agencyCode: focusedClosureMetadata.agencyCode ?? parsed.receiptData.agencyCode,
          // No rescatar SUBAG desde el OCR general: solo vale la franja identificada.
          subagentCode: validSubagent(focusedClosureMetadata.subagentCode),
          machineCode: focusedClosureMetadata.machineCode ?? null,
          address: focusedClosureMetadata.address ?? parsed.receiptData.address,
          terminalId: focusedClosureMetadata.terminalId ?? null,
          printedAt: focusedClosureMetadata.printedAt ?? parsed.receiptData.printedAt,
          periodNumber: labelledPeriod,
          commissionRates,
        };
        // The printed date stays in receipt metadata; the financial entry stays on today's operational day.
        setDate(initialRendition?.renditionDate ?? today);
        setReceiptData(closureReceipt);
        setGameListExpanded(true);
        setReceiptReviewed(false);
        setAmounts(mapTicketClosureAmounts(closureReceipt, periodGames));
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
            combined[gameId] = (priorAmount + scannedAmount).toFixed(2);
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
            ? ((parseMoney(previous[target.id] ?? "") ?? 0) + qr.amount!).toFixed(2)
            : qr.amount!.toFixed(2),
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
          const value = Number(reportedAmount.replace(",", "."));
          if (!reportedAmount.trim() || !Number.isFinite(value) || value <= 0 || value > netToRemit || value > 999999999999.99) {
            event.preventDefault();
            setConfirmationError("Ingresá un importe mayor que cero y no superior al efectivo neto después de descontar la comisión.");
            return;
          }
        }
        setConfirmationError("");
      }}
    >
      <input type="hidden" name="agent_id" value={agentId} />
      <input type="hidden" name="rendition_id" value={initialRendition?.id ?? ""} />
      <input type="hidden" name="ticket_qr_payload" value={qrPayload} />
      <input type="hidden" name="ticket_receipt_data" value={receiptData ? JSON.stringify(receiptData) : ""} />
      <input type="hidden" name="game_period" value={period} />
      <input type="hidden" name="draw_period" value={period} />
      <input type="hidden" name="draw_number" value={drawNumber} />
      <input type="hidden" name="capture_method" value={mode === "manual" ? "manual" : qrPayload ? "qr" : fileName ? "photo" : initialRendition?.captureMethod === "photo" ? "photo" : initialRendition?.captureMethod === "qr" ? "qr" : "manual"} />
      {!initialRendition && (
        <>
          <input type="hidden" name="operational_date" value={today} />
          <input type="hidden" name="draw_status" value={dailyStatusChoice} />
          <input type="hidden" name="reported_amount" value={dailyStatusChoice === "incomplete" ? reportedAmount : netToRemit.toFixed(2)} />
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
            <span className="ticket-photo-picker-cta" aria-hidden="true">Elegir foto o archivo</span>
            <input
              id={ticketPhotoInputId}
              className="ticket-photo-native-input"
              type="file"
              name="ticket_photo"
              aria-label="Elegir foto o archivo del comprobante del ticket"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|avif|bmp|gif|tiff?)$/i.test(file.name);
                  if (isImage) {
                    void processTicket(file);
                  } else {
                    setError("El archivo elegido no parece ser una imagen. Seleccioná una foto del ticket en Fotos, Galería o Archivos.");
                    setNotice("");
                  }
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
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
          receiptData ? (
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
                <strong>{receiptData ? "Ticket de fin de jornada leído" : total > 0 ? "Importes reconocidos y listos para revisar" : "Lista de juegos contraída"}</strong>
                <p>{receiptData
                  ? "Los datos detectados se conservaron. Abrí la lista completa para revisar juegos, sorteos, importes y totales antes de guardar."
                  : total > 0
                    ? "Se detectaron importes por " + new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(total) + ". Abrí la lista para verificar o corregir cada valor."
                    : "La lista completa se mantiene oculta para que la pantalla no sea tan larga. Tocá “Abrir la lista completa” para cargar o revisar los importes manualmente."}</p>
              </div>
            </div>
          </>
        )}
      </div>

      <label className="ticket-input-block"><span>Número(s) de ticket / cupón</span><textarea name="ticket_numbers" rows={2} value={ticketNumbers} onChange={(event) => setTicketNumbers(event.target.value)} placeholder="Se completa desde la lectura o ingresalo manualmente." /></label>
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
            if (receiptData) {
              setReceiptReviewed(true);
              setReceiptData((previous) => previous ? { ...previous, userConfirmedReview: true } : previous);
              setDailyStatusChoice("complete");
            }
            setConfirmationOpen(true);
          }}
          disabled={!periodGames.length || !period || busy || total <= 0 || netToRemit <= 0 || Boolean(detectedPeriodMismatch)}>
          {busy ? "Leyendo ticket…" : initialRendition ? "Guardar cambios de la rendición" : "Confirmar y guardar rendición"}
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
                  <small>Indicá cuánto efectivo entregó hasta el momento, sin superar el neto después de comisión.</small>
                </span>
              </label>
            </div>

            {dailyStatusChoice === "incomplete" && (
              <div className="rendition-confirmation-fields">
                <label className="rendition-confirm-amount-label">
                  Monto rendido hasta el momento
                  <input
                    type="number"
                    min="0.01"
                    max={netToRemit}
                    step="0.01"
                    inputMode="decimal"
                    value={reportedAmount}
                    onChange={(event) => { setReportedAmount(event.target.value); setConfirmationError(""); }}
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
