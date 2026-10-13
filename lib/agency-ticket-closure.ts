export type TicketReceiptMetric = { count: number | null; amount: number | null };

export type TicketClosureData = {
  type: "loteria-corrientes-end-of-day-v1";
  header: string;
  agencyCode: string | null;
  subagentCode: string | null;
  machineCode: string | null;
  address: string | null;
  terminalId: string | null;
  printedAt: { date: string | null; time: string | null; raw: string | null };
  openDraws: { name: string; status: string }[];
  quiniela: { valids: TicketReceiptMetric; cancelledSpecial: TicketReceiptMetric; prizesPaid: TicketReceiptMetric };
  quinielaAlToque: { valids: TicketReceiptMetric; prizesPaid: TicketReceiptMetric };
  otherGames: { name: string; count: number | null; amount: number | null }[];
  totalOtherGames: TicketReceiptMetric;
  otherGamesPrizes: TicketReceiptMetric;
  totalPrizes: TicketReceiptMetric;
  generalTotal: TicketReceiptMetric;
  digital: { cobros: TicketReceiptMetric; devoluciones: TicketReceiptMetric };
  periodNumber: string | null;
  openedAt: { date: string | null; time: string | null; raw: string | null };
  closedAt: { date: string | null; time: string | null; raw: string | null };
  downloadStatus: string | null;
  consistency: { salesTotalsMatch: boolean | null; prizeTotalsMatch: boolean | null };
  userConfirmedReview?: boolean;
  rawText: string;
};

const normalizeTicketText = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function moneyAllowZero(value: string): number | null {
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
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function metricFromLine(line: string): TicketReceiptMetric | null {
  const values = line.match(/\d[\d.,]*/g) ?? [];
  if (values.length < 2) return null;
  const countToken = values[values.length - 2] ?? "";
  const amountToken = values[values.length - 1] ?? "";
  const countPrefix = countToken.replace(/[.,].*$/, "");
  const count = countPrefix ? Number(countPrefix) : NaN;
  const amount = moneyAllowZero(amountToken);
  if (!Number.isFinite(count) || amount === null) return null;
  return { count: Math.max(0, Math.trunc(count)), amount };
}

const emptyMetric = (): TicketReceiptMetric => ({ count: null, amount: null });
const cents = (value: number | null) => value === null ? null : Math.round(value * 100);

function metricInRange(lines: string[], start: number, end: number, matcher: RegExp, takeLast = false): TicketReceiptMetric {
  const found: TicketReceiptMetric[] = [];
  for (let i = Math.max(0, start); i < Math.min(lines.length, end); i += 1) {
    if (!matcher.test(normalizeTicketText(lines[i] ?? ""))) continue;
    let metric = metricFromLine(lines[i] ?? "");
    if (!metric) {
      for (let j = i + 1; j < Math.min(end, i + 3); j += 1) {
        const nextText = normalizeTicketText(lines[j] ?? "");
        if (/^(QUINIELA|OTROS JUEGOS|MEDIOS DIGITALES|TOTAL GENERAL)/.test(nextText)) break;
        metric = metricFromLine(lines[j] ?? "");
        if (metric) break;
      }
    }
    if (metric) found.push(metric);
  }
  return (takeLast ? found.at(-1) : found[0]) ?? emptyMetric();
}

function findIndex(lines: string[], matcher: RegExp, fallback = -1): number {
  const index = lines.findIndex((line) => matcher.test(normalizeTicketText(line)));
  return index >= 0 ? index : fallback;
}

function parseDateTime(rawLine: string | null) {
  if (!rawLine) return { date: null, time: null, raw: null };
  const match = rawLine.match(/(\d{2}[/-]\d{2}[/-]\d{2,4})(?:\s+(?:A\s+LAS\s+)?(\d{2}:\d{2}:\d{2}))?/i);
  return { date: match?.[1] ?? null, time: match?.[2] ?? null, raw: rawLine.trim() || null };
}

function readTaggedCode(codeLine: string, tag: string): string | null {
  const match = normalizeTicketText(codeLine).match(new RegExp("\\b" + tag + "\\s*[:.]?\\s*([0-9OIL]{1,8})"));
  if (!match?.[1]) return null;
  return match[1].replace(/[O]/g, "0").replace(/[IL]/g, "1");
}

export function parseTicketClosure(text: string): TicketClosureData | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const normalized = lines.map(normalizeTicketText);
  const joined = normalized.join("\n");
  const isEndOfDay = /FIN\s+DE\s+JORNADA/.test(joined) &&
    (/TOTALES?\s+EN\s+TJ/.test(joined) || /CERRADO/.test(joined) || /DESCARGA?\s+CONFIRMADA/.test(joined));
  if (!isEndOfDay) return null;

  const qIndex = findIndex(lines, /^QUINIELA(?:\s+CORRIENTES?)?$/);
  const qToqueIndex = findIndex(lines, /QUINIELA\s+AL\s+TOQUE/);
  const otherIndex = findIndex(lines, /OTROS\s+JUEGOS/);
  const digitalIndex = findIndex(lines, /MEDIOS\s+DIGITALES/);
  const otherEnd = digitalIndex >= 0 ? digitalIndex : lines.length;
  const qEnd = qToqueIndex >= 0 ? qToqueIndex : (otherIndex >= 0 ? otherIndex : lines.length);
  const qToqueEnd = otherIndex >= 0 ? otherIndex : lines.length;

  const qValid = metricInRange(lines, qIndex >= 0 ? qIndex : 0, qEnd, /\bVALIDOS?\b/);
  const qCancelled = metricInRange(lines, qIndex >= 0 ? qIndex : 0, qEnd, /ANULADOS?\s*(?:ESP|ESPECIALES?)/);
  const qPrizes = metricInRange(lines, qIndex >= 0 ? qIndex : 0, qEnd, /PREMIOS?\s+PAG/);
  const toqueValid = metricInRange(lines, qToqueIndex >= 0 ? qToqueIndex : 0, qToqueEnd, /\bVALIDOS?\b/);
  const toquePrizes = metricInRange(lines, qToqueIndex >= 0 ? qToqueIndex : 0, qToqueEnd, /PREMIOS?\s+PAG/);

  const gameLabels: Array<{ name: string; matcher: RegExp }> = [
    { name: "Loto Plus", matcher: /^LOTO\s+PLUS(?!\s+EXTRA)(?!\s+5)/ },
    { name: "Quini 6", matcher: /^QUINI[\s-]*6\b/ },
    { name: "Pozo Quiniela", matcher: /^POZO\s+QUINIELA/ },
    { name: "Brinco", matcher: /^BRINCO/ },
    { name: "Loto 5 Plus", matcher: /^LOTO\s+5\s+PLUS/ },
    { name: "Lotería Online", matcher: /^LOTERIA\s+ONLINE/ },
    { name: "Quiniela Poceada", matcher: /^QUINIELA\s+POCEADA/ },
    { name: "Telekino", matcher: /^TELEKINO/ },
  ];
  const otherGames = gameLabels.map(({ name, matcher }) => {
    const index = normalized.findIndex((line) => matcher.test(line));
    let metric = index >= 0 ? metricFromLine(lines[index] ?? "") : null;
    if (!metric && index >= 0) {
      for (let j = index + 1; j < Math.min(otherEnd, index + 3); j += 1) {
        const nextText = normalizeTicketText(lines[j] ?? "");
        if (/^(LOTO PLUS|QUINI[\s-]*6|POZO QUINIELA|BRINCO|LOTO 5 PLUS|LOTERIA ONLINE|QUINIELA POCEADA|TELEKINO|TOTAL O|TOTAL OTROS|PREMIOS PAG)/.test(nextText)) break;
        metric = metricFromLine(lines[j] ?? "");
        if (metric) break;
      }
    }
    return { name, count: metric?.count ?? null, amount: metric?.amount ?? null };
  });

  const totalOtherIndex = findIndex(lines, /TOTAL\s+(?:O\.?\s*)?JUEGOS|TOTAL\s+OTROS\s+JUEGOS/, otherIndex >= 0 ? otherIndex : 0);
  const totalOtherGames = metricInRange(lines, otherIndex >= 0 ? otherIndex : 0, otherEnd, /TOTAL\s+(?:O\.?\s*)?JUEGOS|TOTAL\s+OTROS\s+JUEGOS/);
  const otherGamesPrizes = metricInRange(lines, totalOtherIndex >= 0 ? totalOtherIndex + 1 : (otherIndex >= 0 ? otherIndex : 0), otherEnd, /PREMIOS?\s+PAG/);
  const totalPrizes = metricInRange(lines, otherIndex >= 0 ? otherIndex : 0, otherEnd, /PREMIOS?\s+PAG/, true);
  const generalTotal = metricInRange(lines, otherIndex >= 0 ? otherIndex : 0, otherEnd, /TOTAL\s+GENERAL/);
  const cobros = digitalIndex >= 0 ? metricInRange(lines, digitalIndex, lines.length, /^COBROS?\b/) : emptyMetric();
  const devoluciones = digitalIndex >= 0 ? metricInRange(lines, digitalIndex, lines.length, /^DEVOLUCIONES?\b/) : emptyMetric();

  const codeIndex = findIndex(lines, /\bAG\s*[:.]?.*\bSUBAG\b/);
  const codeLine = codeIndex >= 0 ? lines[codeIndex] ?? "" : "";
  const address = lines.find((line) => /\b(LA RIOJA|CALLE|AVENIDA|AV\.|RUTA|DOMICILIO|DIRECCION)\b/i.test(normalizeTicketText(line))) ?? null;
  const terminalLine = lines.find((line) => /MAQU[I1]NOLA?\s+REAL|MAQUINOLA\s+REAL/i.test(normalizeTicketText(line))) ?? null;
  const terminalId = terminalLine?.match(/(\d{3,8})\s*$/)?.[1] ?? null;

  const printedLine = lines.find((line) => /IMPRESO\s+EL\b/i.test(normalizeTicketText(line))) ?? null;
  const printedAt = parseDateTime(printedLine);
  const openedLine = lines.find((line) => /\bABIERTO\s+EL\b/i.test(normalizeTicketText(line))) ?? null;
  const closedLine = lines.find((line) => /\bCERRADO\b/i.test(normalizeTicketText(line))) ?? null;
  const openedAt = parseDateTime(openedLine);
  const closedAt = parseDateTime(closedLine);
  const periodLine = lines.find((line) => /\bPERIODO\b/i.test(normalizeTicketText(line))) ?? null;
  const periodMatch = periodLine?.match(/\b([0-9OIL][0-9OIL ]{1,11})\s*$/i);
  const periodNumber = periodMatch?.[1]?.replace(/\s+/g, "") ?? null;

  const drawsStart = findIndex(lines, /SORTEOS?\s+ABIERTOS?/);
  const drawsEnd = findIndex(lines, /TOTALES?\s+EN\s+TJ|TOTALES?\s+TJ/, drawsStart >= 0 ? drawsStart + 1 : 0);
  const drawLines = drawsStart >= 0
    ? lines.slice(drawsStart + 1, drawsEnd > drawsStart ? drawsEnd : Math.min(lines.length, drawsStart + 12))
    : [];
  const openDraws = drawLines
    .filter((line) => /\bON[-\s]?OFF\b/i.test(normalizeTicketText(line)))
    .map((line) => {
      const match = line.match(/ON[-\s]?OFF/i);
      return { name: line.replace(/ON[-\s]?OFF/i, "").trim(), status: match?.[0] ?? "ON-OFF" };
    })
    .filter((item) => item.name.length > 0);
  const downloadLine = lines.find((line) => /DESCARGA?\s+CONFIRMADA/i.test(normalizeTicketText(line))) ?? null;

  const salesAmounts = [qValid.amount, toqueValid.amount, ...otherGames.map((game) => game.amount)];
  const salesTotalsMatch = salesAmounts.every((value) => value !== null) && generalTotal.amount !== null
    ? cents(salesAmounts.reduce<number>((sum, value) => sum + (value ?? 0), 0)) === cents(generalTotal.amount)
    : null;
  const prizeAmounts = [qPrizes.amount, toquePrizes.amount, otherGamesPrizes.amount];
  const prizeTotalsMatch = prizeAmounts.every((value) => value !== null) && totalPrizes.amount !== null
    ? cents(prizeAmounts.reduce<number>((sum, value) => sum + (value ?? 0), 0)) === cents(totalPrizes.amount)
    : null;

  return {
    type: "loteria-corrientes-end-of-day-v1",
    header: "FIN DE JORNADA",
    agencyCode: readTaggedCode(codeLine, "AG"),
    subagentCode: readTaggedCode(codeLine, "SUBAG"),
    machineCode: readTaggedCode(codeLine, "MAQ"),
    address: address?.trim() ?? null,
    terminalId,
    printedAt,
    openDraws,
    quiniela: { valids: qValid, cancelledSpecial: qCancelled, prizesPaid: qPrizes },
    quinielaAlToque: { valids: toqueValid, prizesPaid: toquePrizes },
    otherGames,
    totalOtherGames,
    otherGamesPrizes,
    totalPrizes,
    generalTotal,
    digital: { cobros, devoluciones },
    periodNumber,
    openedAt,
    closedAt,
    downloadStatus: downloadLine?.trim() ?? null,
    consistency: { salesTotalsMatch, prizeTotalsMatch },
    rawText: text.slice(0, 12000),
  };
}

export function mapTicketClosureAmounts(receipt: TicketClosureData, games: { id: string; name: string }[]): Record<string, string> {
  const entries: Array<{ amount: number | null; match: (name: string) => boolean }> = [
    { amount: receipt.quiniela.valids.amount, match: (name) => name === "QUINIELA CORRENTINA" || name === "QUINIELA" },
    { amount: receipt.quinielaAlToque.valids.amount, match: (name) => name.includes("AL TOQUE") },
    { amount: receipt.otherGames.find((item) => item.name === "Loto Plus")?.amount ?? null, match: (name) => name === "LOTO PLUS" },
    { amount: receipt.otherGames.find((item) => item.name === "Quini 6")?.amount ?? null, match: (name) => name.includes("QUINI 6") || name === "QUINI6" },
    { amount: receipt.otherGames.find((item) => item.name === "Brinco")?.amount ?? null, match: (name) => name === "BRINCO" },
    { amount: receipt.otherGames.find((item) => item.name === "Loto 5 Plus")?.amount ?? null, match: (name) => name.includes("LOTO 5") },
    { amount: receipt.otherGames.find((item) => item.name === "Quiniela Poceada")?.amount ?? null, match: (name) => name.includes("POCEADA") },
    { amount: receipt.otherGames.find((item) => item.name === "Telekino")?.amount ?? null, match: (name) => name === "TELEKINO" },
  ];
  const mapped: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.amount === null) continue;
    const game = games.find((candidate) => entry.match(normalizeTicketText(candidate.name)));
    if (game) mapped[game.id] = entry.amount.toFixed(2);
  }
  return mapped;
}
