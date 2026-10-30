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
  commissionRates?: Record<string, number | null>;
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
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function metricFromLine(line: string): TicketReceiptMetric | null {
  // The digits in "Quini 6" and "Loto 5 Plus" are game names, not amounts.
  const cleaned = normalizeTicketText(line)
    .replace(/^(?:LOTO\s+5\s+PLUS|LOTO\s+PLUS|QUINI\s*6|MUINI\s*6|HUI[I1]NI\s*6|QUINIELA\s+POCEADA|LOTER[I1]A\s+ONLINE|POZO\s+QUINIELA|BRINCO|TELEKINO|QUINIELA\s+AL\s+TOQUE|QUINIELA(?:\s+CORRIENTES?)?)\s*/i, "").trim();
  const values = cleaned.match(/\d[\d.,]*/g) ?? [];
  if (!values.length) return null;
  const amountToken = values[values.length - 1] ?? "";
  const hasCurrency = /\$|\bARS\b|PESOS/i.test(cleaned);
  const hasCents = /[.,]\d{2}\b/.test(amountToken);
  if (values.length === 1 && !hasCurrency && !hasCents) return null;
  const amount = moneyAllowZero(amountToken);
  if (amount === null) return null;
  if (values.length === 1) return { count: 0, amount };
  const countToken = values[values.length - 2] ?? "";
  const countPrefix = countToken.replace(/[.,].*$/, "");
  const count = countPrefix ? Number(countPrefix) : 0;
  return { count: Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0, amount };
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
        if (/^(QUINIELA|OTROS\s+JU|MEDIOS\s+DIGITALES|NEDIOS\s+DIGITALES|TOTAL\s+(?:O|0)\.?\s*JUEGOS|TOTAL\s+GENERAL|PREMIOS?\s+P[A-Z0-9]{2,3})/.test(nextText)) break;
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
  const date = rawLine.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i)?.[0] ?? null;
  // El cierre puede imprimir solo hora:minuto; se conserva siempre el renglón original.
  const time = rawLine.match(/\d{1,2}:\d{2}(?::\d{2})?/)?.[0] ?? null;
  return { date, time, raw: rawLine.trim() || null };
}

function readShortCode(value: string): string | null {
  const match = value.match(/[0-9OQIL|!](?:[\s.-]*[0-9OQIL|!]){0,7}/);
  if (!match) return null;
  const digits = match[0].replace(/[OQ]/g, "0").replace(/[IL|!]/g, "1").replace(/\D/g, "");
  return /^\d{1,8}$/.test(digits) ? digits : null;
}

function readNumberAfterLabel(value: string, labelPattern: RegExp): string | null {
  const match = value.match(labelPattern);
  if (!match || match.index === undefined) return null;
  const suffix = value.slice(match.index + match[0].length)
    .replace(/^\s*(?:(?:NRO|NUM(?:ERO)?|NO|N[º°.]?|#)\s*[:.#º°-]?\s*)+/i, " ");
  return readShortCode(suffix);
}

function readCodeAfterLabel(lines: string[], labelPattern: RegExp, skipPattern?: RegExp): string | null {
  const normalized = lines.map(normalizeTicketText);
  for (let index = 0; index < normalized.length; index += 1) {
    const line = normalized[index] ?? "";
    if (skipPattern?.test(line)) continue;
    const code = readNumberAfterLabel(line, labelPattern);
    if (code) return code;
    if (!labelPattern.test(line)) continue;

    for (let next = index + 1; next < Math.min(normalized.length, index + 3); next += 1) {
      const candidateLine = normalized[next] ?? "";
      if (/\b(?:AGENCIA|SUBAG(?:ENTE)?|MAQ(?:UINA)?|DOMICILIO|DIRECCION|ABIERTO|CERRADO|IMPRESO|SORTEOS?|TOTALES?|TOTAL|QUINIELA|MEDIOS|OTROS\s+JUEGOS|PREMIOS?)\b/.test(candidateLine)) break;
      if (!/^[0-9OQIL|!\s.-]{1,20}$/.test(candidateLine)) continue;
      const nextCode = readShortCode(candidateLine);
      if (nextCode) return nextCode;
    }
  }
  return null;
}

/**
 * Lee el número impreso después de "Período N.º" en cualquier ticket,
 * incluso cuando el OCR separa el rótulo o los dígitos en varias líneas.
 * Devuelve texto para conservar ceros iniciales; no confundirlo con la fecha.
 */
export function normalizePrintedPeriodGlyphs(raw: string): string | null {
  const token = raw.toUpperCase().replace(/[^0-9A-Z|!]/g, "");
  if (token.length < 3 || token.length > 7) return null;
  const hasOcrLetters = /[A-Z|!]/.test(token);
  const digits = [...token].map((char, index) => {
    if (/[OQBDGCEAH]/.test(char)) return "0";
    if (/[IL|!]/.test(char)) return "1";
    if (char === "Z") return "2";
    if (char === "8" && index === 0 && hasOcrLetters) return "0";
    return /^[0-9]$/.test(char) ? char : "";
  }).join("");
  if (!/^\d{3,7}$/.test(digits)) return null;
  return digits.padStart(7, "0");
}

function periodGlyphCandidates(fragment: string): string[] {
  const cleaned = fragment
    .replace(/^\s*(?:(?:NRO|NUM(?:ERO)?|NO|N[º°.]?|#)\s*[:.#º°-]?\s*)+/i, " ")
    .replace(/\b(?:NRO|NUM(?:ERO)?|NO|N[º°.]?|#)\b/gi, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");
  const pattern = /(?<![0-9A-Z|!])([0-9OQIL|!BDGCEAZH8](?:[\s.:_-]*[0-9OQIL|!BDGCEAZH8]){3,6})(?![0-9A-Z|!])/gi;
  return [...cleaned.matchAll(pattern)]
    .map((match) => normalizePrintedPeriodGlyphs(match[1] ?? ""))
    .filter((value): value is string => Boolean(value));
}

export function extractTicketPeriodNumber(text: string): string | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const normalizedLines = lines.map(normalizeTicketText);
  const periodLabelPattern = /P\s*E?\s*R\s*[I1LY]\s*[O0Q8G]?\s*D\s*[O0Q8G]?/i;

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const line = normalizedLines[index] ?? "";
    const label = periodLabelPattern.exec(line);
    if (!label || label.index === undefined) continue;
    const suffix = line.slice(label.index + label[0].length);
    const direct = periodGlyphCandidates(suffix)[0];
    if (direct) return direct;
    let context = "";
    for (let next = index + 1; next < Math.min(normalizedLines.length, index + 4); next += 1) {
      const following = normalizedLines[next] ?? "";
      if (!following || !/^[0-9OQIL|!BDGCEAZH .:_-]+$/i.test(following)) break;
      context += " " + following;
      const candidate = periodGlyphCandidates(context)[0];
      if (candidate) return candidate;
    }
  }
  return null;
}
export function parseTicketClosure(text: string, assumeEndOfDay = false): TicketClosureData | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const normalized = lines.map(normalizeTicketText);
  const joined = normalized.join("\n");
  // Térmica borrosa: no depender de que una sola frase salga perfecta en OCR.
  // Un cierre válido se reconoce por varias marcas independientes del ticket.
  const closureMarkers = {
    header: /FIN\s+DE\s+(?:JOR|TOR)NADA/.test(joined),
    totalsTj: /TOTALES?\s+EN\s+T[J7I1]|TOTALES?\s+EN\s+T[I1J7]/.test(joined),
    general: /TOTAL\s+GENE?RA[L1I]?/.test(joined),
    opened: /AB[I1L]ERTO\s+E[L1I]/.test(joined),
    closed: /CERRAD[O0]?/.test(joined),
    digital: /[MN]ED[I1]OS\s+D[I1]G[I1]T[A4][L1I]ES/.test(joined),
    period: /PER[I1]ODO/.test(joined),
    prizes: /PREM[I1]OS?\s+P[A-Z]{2,3}/.test(joined),
    otherGames: /OTROS\s+JUE/.test(joined),
    alToque: /AL\s+TOQUE/.test(joined),
  };
  const markerCount = Object.values(closureMarkers).filter(Boolean).length;
  // El encabezado térmico puede quedar ilegible. Reconocer el formato por una
  // combinación de secciones independientes del cierre, sin exigir todos los rótulos.
  const hasClosureFooter = closureMarkers.general && (
    closureMarkers.totalsTj ||
    closureMarkers.opened ||
    closureMarkers.closed ||
    closureMarkers.period ||
    closureMarkers.digital ||
    closureMarkers.prizes ||
    closureMarkers.otherGames ||
    closureMarkers.alToque
  );
  const isEndOfDay = (closureMarkers.header && markerCount >= 1) ||
    hasClosureFooter ||
    (markerCount >= 3 && (closureMarkers.general || closureMarkers.totalsTj) &&
      (closureMarkers.opened || closureMarkers.closed || closureMarkers.period || closureMarkers.digital));
  if (!isEndOfDay && !assumeEndOfDay) return null;

  const qIndex = findIndex(lines, /^QUINIELA(?:\s+CORRIENTES?)?$/);
  const qToqueIndex = findIndex(lines, /AL\s+TOQUE/);
  const otherIndex = findIndex(lines, /OTROS\s+JUE\w{2,3}/);
  const digitalIndex = findIndex(lines, /[MN]EDIOS\s+DIGITALES/);
  const otherEnd = digitalIndex >= 0 ? digitalIndex : lines.length;
  const qEnd = qToqueIndex >= 0 ? qToqueIndex : (otherIndex >= 0 ? otherIndex : lines.length);
  const qToqueEnd = otherIndex >= 0 ? otherIndex : lines.length;

  const qValid = metricInRange(lines, qIndex >= 0 ? qIndex : 0, qEnd, /\bVALIDOS?\b/);
  const qCancelled = metricInRange(lines, qIndex >= 0 ? qIndex : 0, qEnd, /ANULADOS?\s*(?:ESP|ESPECIALES?)/);
  const qPrizes = metricInRange(lines, qIndex >= 0 ? qIndex : 0, qEnd, /PREMIOS?\s+P[A-Z0-9]{2,3}/);
  // Si el ticket no contiene la sección «Quiniela al Toque», no reutilizar
  // el primer renglón Válidos: pertenece a Quiniela y duplicaría sus ventas.
  const toqueValid = qToqueIndex >= 0
    ? metricInRange(lines, qToqueIndex, qToqueEnd, /\bVALIDOS?\b/)
    : emptyMetric();
  const toquePrizes = qToqueIndex >= 0
    ? metricInRange(lines, qToqueIndex, qToqueEnd, /PREMIOS?\s+P[A-Z0-9]{2,3}/)
    : emptyMetric();

  const gameLabels: Array<{ name: string; matcher: RegExp }> = [
    { name: "Loto Plus", matcher: /^(?:L?OTO)\s+PLUS(?!\s+EXTRA)(?!\s+5)/ },
    { name: "Quini 6", matcher: /^(?:QUINI|MUINI|HUI[I1]NI)[\s-]*6\b/ },
    { name: "Pozo Quiniela", matcher: /^(?:POZO\s+QUINIELA|0?2?0\s+FUINIEL|POZO\s+FUINIEL)/ },
    { name: "Brinco", matcher: /^(?:BRINCO|BR\s+INTO)/ },
    { name: "Loto 5 Plus", matcher: /^(?:L?OTO)\s+5\s+PLUS/ },
    { name: "Lotería Online", matcher: /^(?:LOTERIA|L?ATERIA)\s+ONLINE/ },
    { name: "Quiniela Poceada", matcher: /^QUINIELA\s+POC/ },
    { name: "Telekino", matcher: /^TELEK/ },
  ];
  const totalOtherMatcher = /TOTAL\s+(?:(?:O|0)\.?\s*)?JUEGOS|TOTAL\s+OTROS\s+JUEGOS/;
  const totalOtherIndex = findIndex(lines, totalOtherMatcher, otherIndex >= 0 ? otherIndex : 0);
  // The same game names occur in "Sorteos abiertos"; read only inside "Otros juegos".
  const otherRowsStart = otherIndex >= 0 ? otherIndex + 1 : (qToqueIndex >= 0 ? qToqueIndex + 1 : 0);
  const otherRowsEnd = totalOtherIndex > otherRowsStart ? totalOtherIndex : otherEnd;
  const otherGames = gameLabels.map(({ name, matcher }) => {
    // Never map an arbitrary numeric row by position: that produced false prices.
    const index = normalized.findIndex((line, i) => i >= otherRowsStart && i < otherRowsEnd && matcher.test(line));
    let metric = index >= 0 ? metricFromLine(lines[index] ?? "") : null;
    if (!metric && index >= 0) {
      for (let j = index + 1; j < Math.min(otherRowsEnd, index + 3); j += 1) {
        const nextText = normalizeTicketText(lines[j] ?? "");
        if (/^(?:L?OTO|QUINI|MUINI|HUI|POZO|020|BRINCO|BR\s+INTO|LOTERIA|ATERIA|QUINIELA|TELEK|TOTAL|PREMIOS?\s+P[A-Z0-9]{2,3})/.test(nextText)) break;
        metric = metricFromLine(lines[j] ?? "");
        if (metric) break;
      }
    }
    return { name, count: metric?.count ?? null, amount: metric?.amount ?? null };
  });
  const totalOtherGames = metricInRange(lines, otherIndex >= 0 ? otherIndex : 0, otherEnd, totalOtherMatcher);
  const otherGamesPrizes = metricInRange(lines, totalOtherIndex >= 0 ? totalOtherIndex + 1 : (otherIndex >= 0 ? otherIndex : 0), otherEnd, /PREMIOS?\s+P[A-Z0-9]{2,3}/);
  const totalPrizes = metricInRange(lines, otherIndex >= 0 ? otherIndex : 0, otherEnd, /PREMIOS?\s+P[A-Z0-9]{2,3}/, true);
  const generalTotal = metricInRange(lines, otherIndex >= 0 ? otherIndex : 0, otherEnd, /TOTAL\s+GENERAL/);
  const cobros = digitalIndex >= 0 ? metricInRange(lines, digitalIndex, lines.length, /^COBROS?\b/) : emptyMetric();
  const devoluciones = digitalIndex >= 0 ? metricInRange(lines, digitalIndex, lines.length, /^DEVOLUCIONES?\b/) : emptyMetric();

  const agencyCode = readCodeAfterLabel(lines, /\b(?:AGENCIA|AG)\b/);
  const subagentCode = readCodeAfterLabel(lines, /\b(?:SUBAGENTE|SUBAG)\b/);
  const machineCode = readCodeAfterLabel(lines, /\b(?:MAQUINA|MAQ|MA[0O])\b/, /\b(?:MAQU[I1L]N[A4]?|MAQ|MAYU[I1L]ND?)\s+REAL\b/);

  const normalizedLines = lines.map(normalizeTicketText);
  const terminalPattern = /\b(?:MAQU[I1L]N[A4]?\s+REAL|MAQ\s+REAL|MAYU[I1L]ND?\s+REAL|M[A4]YU[I1L]ND?\s+REAL)\b/;
  const terminalIndex = normalizedLines.findIndex((line) => terminalPattern.test(line));
  let terminalId = terminalIndex >= 0
    ? readNumberAfterLabel(normalizedLines[terminalIndex] ?? "", terminalPattern)
    : null;
  if (!terminalId && terminalIndex >= 0 && terminalIndex + 1 < lines.length) {
    const nextLine = normalizedLines[terminalIndex + 1] ?? "";
    if (/^[0-9OQIL|!\s.-]{1,20}$/.test(nextLine)) terminalId = readShortCode(nextLine);
  }

  const explicitAddressIndex = normalizedLines.findIndex((line) => /\b(?:DOMICILIO|DIRECCION|DIREC)\b/.test(line));
  const streetAddressIndex = normalizedLines.findIndex((line) => /\b(?:CALLE|AVENIDA|AV\.|RUTA|LA RIOJA|LA RIOTA)\b/.test(line));
  const addressIndex = explicitAddressIndex >= 0 ? explicitAddressIndex : streetAddressIndex;
  let address: string | null = addressIndex >= 0 ? (lines[addressIndex] ?? "").trim() || null : null;
  if (addressIndex >= 0 && address && !/\d|\b(?:CALLE|AVENIDA|AV\.|RUTA|LA RIOJA|LA RIOTA)\b/i.test(address)) {
    const nextLine = lines[addressIndex + 1]?.trim() ?? "";
    if (nextLine && !/^(?:AGENCIA|AG|SUBAG|MAQ|ABIERTO|CERRADO|IMPRESO|TOTAL|FIN DE JORNADA)\b/i.test(normalizedLines[addressIndex + 1] ?? "")) {
      address = nextLine;
    }
  }
  const printedLine = lines.find((line) => /\bIMPRES[O0]\b/i.test(normalizeTicketText(line))) ?? null;
  const printedAt = parseDateTime(printedLine);
  const openedLine = lines.find((line) => /\bAB[I1L]ERTO\s+E[L1I]\b/i.test(normalizeTicketText(line))) ?? null;
  const closedLine = lines.find((line) => /\bCERRAD[O0]?\b/i.test(normalizeTicketText(line))) ?? null;
  const openedAt = parseDateTime(openedLine);
  const closedAt = parseDateTime(closedLine);
  const periodNumber = extractTicketPeriodNumber(text);

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
    agencyCode,
    subagentCode,
    machineCode,
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
    { amount: receipt.otherGames.find((item) => item.name === "Telekino")?.amount ?? null, match: (name) => name.includes("TELEK") },
    { amount: receipt.otherGames.find((item) => item.name === "Pozo Quiniela")?.amount ?? null, match: (name) => name.includes("POZO QUINIELA") },
    { amount: receipt.otherGames.find((item) => item.name === "Lotería Online")?.amount ?? null, match: (name) => name.includes("LOTERIA ONLINE") },
  ];
  const mapped: Record<string, string> = {};
  // Calcular el control con los valores actuales, no con el booleano guardado
  // durante la primera lectura OCR. Así el usuario puede corregir una cifra y validar.
  const salesAmounts = [
    receipt.quiniela.valids.amount,
    receipt.quinielaAlToque.valids.amount,
    ...receipt.otherGames.map((item) => item.amount),
  ];
  const salesTotal = receipt.generalTotal.amount;
  // No bloquear todos los importes válidos porque una línea secundaria quedó
  // sin lectura. Solo trasladar cifras realmente reconocidas y exigir que la suma
  // de esas cifras coincida exactamente con el total impreso antes de proponerlas.
  // Las líneas null permanecen sin asignar: nunca se inventan ceros.
  const knownSalesAmounts = salesAmounts.filter((amount): amount is number => amount !== null);
  const salesMatch = salesTotal !== null &&
    knownSalesAmounts.length > 0 &&
    Math.round(knownSalesAmounts.reduce<number>((sum, amount) => sum + amount, 0) * 100) ===
      Math.round(salesTotal * 100);
  if (!salesMatch) return mapped;
  for (const entry of entries) {
    if (entry.amount === null) continue;
    const game = games.find((candidate) => entry.match(normalizeTicketText(candidate.name)));
    if (game) mapped[game.id] = String(Math.round(entry.amount));
  }
  return mapped;
}
