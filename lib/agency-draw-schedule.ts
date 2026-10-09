export const AGENCY_DRAW_TIME_ZONE = "America/Argentina/Cordoba";
export const OFFICIAL_QUINIELA_SCHEDULE_URL = "https://www.loteriacorrentina.gob.ar/juegos/quiniela";
export const OFFICIAL_EXTRACTS_SCHEDULE_URL = "https://cnq.lotemovil.com.ar/extractos";

export type OfficialDrawPeriod = {
  label: string;
  shortLabel: string;
  time: string | null;
  gameName: string;
  kind: "scheduled" | "daily";
};

type ScheduledPeriod = OfficialDrawPeriod & { days: number[] };

const QUINIELA_DAYS = [1, 2, 3, 4, 5, 6]; // lunes a sábado
const SCHEDULE: ScheduledPeriod[] = [
  { label: "La Previa", shortLabel: "Previa", time: "10:15", gameName: "Quiniela Correntina", kind: "scheduled", days: QUINIELA_DAYS },
  { label: "Matutina", shortLabel: "Matutina", time: "15:00", gameName: "Quiniela Correntina", kind: "scheduled", days: QUINIELA_DAYS },
  { label: "Vespertina", shortLabel: "Vespertina", time: "18:00", gameName: "Quiniela Correntina", kind: "scheduled", days: QUINIELA_DAYS },
  { label: "Nocturna", shortLabel: "Nocturna", time: "21:00", gameName: "Quiniela Correntina", kind: "scheduled", days: QUINIELA_DAYS },
  { label: "Quiniela Poceada Correntina", shortLabel: "Poceada", time: "21:00", gameName: "Quiniela Poceada Correntina", kind: "scheduled", days: [2, 4, 6] },
  { label: "Quini 6", shortLabel: "Quini 6", time: "21:15", gameName: "Quini 6", kind: "scheduled", days: [0, 3] },
  { label: "Loto Plus", shortLabel: "Loto Plus", time: "22:00", gameName: "Loto Plus", kind: "scheduled", days: [3, 6] },
  { label: "Loto 5 Plus", shortLabel: "Loto 5 Plus", time: "22:30", gameName: "Loto 5 Plus", kind: "scheduled", days: [6] },
  { label: "Brinco", shortLabel: "Brinco", time: "21:00", gameName: "Brinco", kind: "scheduled", days: [0] },
  { label: "Al Toque (acumulado diario)", shortLabel: "Al Toque", time: null, gameName: "Quiniela Al Toque", kind: "daily", days: [0, 1, 2, 3, 4, 5, 6] },
];

export type DrawPeriodStatus = "complete" | "incomplete" | "review" | "pending" | "upcoming";

export function getAllOfficialDrawPeriods(): OfficialDrawPeriod[] {
  return SCHEDULE.map(({ days: _days, ...period }) => period);
}

export function getOfficialDrawPeriodsForDate(date: string): OfficialDrawPeriod[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const parsed = new Date(date + "T12:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return [];
  const weekday = parsed.getUTCDay();
  return SCHEDULE
    .filter((period) => period.days.includes(weekday))
    .map(({ days: _days, ...period }) => period)
    .sort((a, b) => {
      const minutes = (value: string | null) => value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : 1440;
      return minutes(a.time) - minutes(b.time);
    });
}

export function getAgencyLocalClock(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: AGENCY_DRAW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (name: string) => parts.find((part) => part.type === name)?.value ?? "00";
  return {
    date: get("year") + "-" + get("month") + "-" + get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function drawPeriodHasPassed(period: OfficialDrawPeriod, businessDate: string, now: Date = new Date()): boolean {
  if (!period.time) return false;
  const clock = getAgencyLocalClock(now);
  if (clock.date > businessDate) return true;
  if (clock.date < businessDate) return false;
  return clock.minutes >= Number(period.time.slice(0, 2)) * 60 + Number(period.time.slice(3, 5));
}

export function normalizeDrawPeriodName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function resolveRecognizedDrawPeriod(value: string, periods: OfficialDrawPeriod[]): OfficialDrawPeriod | null {
  const normalized = normalizeDrawPeriodName(value);
  if (!normalized) return null;
  const aliases: Array<[string, string]> = [
    ["QUINIELA POCEADA", "Quiniela Poceada Correntina"],
    ["POCEADA", "Quiniela Poceada Correntina"],
    ["LOTO 5 PLUS", "Loto 5 Plus"],
    ["LOTO PLUS", "Loto Plus"],
    ["QUINI 6", "Quini 6"],
    ["QUINI6", "Quini 6"],
    ["BRINCO", "Brinco"],
    ["AL TOQUE", "Al Toque (acumulado diario)"],
    ["LA PREVIA", "La Previa"],
    ["MATUTINA", "Matutina"],
    ["VESPERTINA", "Vespertina"],
    ["NOCTURNA", "Nocturna"],
  ];
  const label = aliases.find(([alias]) => normalized.includes(alias))?.[1];
  return label ? periods.find((period) => period.label === label) ?? null : null;
}

export function getGamesForDrawPeriod<T extends { name: string; enabled?: boolean }>(
  period: OfficialDrawPeriod | null | undefined,
  games: T[],
): T[] {
  if (!period) return [];
  const target = normalizeDrawPeriodName(period.gameName);
  return games.filter((game) => game.enabled !== false && normalizeDrawPeriodName(game.name) === target);
}

export function getUnmappedOfficialGameNames(games: Array<{ name: string; enabled?: boolean }>): string[] {
  const mapped = new Set(SCHEDULE.map((period) => normalizeDrawPeriodName(period.gameName)));
  return games
    .filter((game) => game.enabled !== false && !mapped.has(normalizeDrawPeriodName(game.name)))
    .map((game) => game.name);
}

/** Choose the latest pending traditional Quiniela turn first, not the earliest unresolved turn. */
export function getPreferredPendingDrawPeriod(periods: OfficialDrawPeriod[]): OfficialDrawPeriod | null {
  if (!periods.length) return null;
  const minutes = (period: OfficialDrawPeriod) =>
    period.time ? Number(period.time.slice(0, 2)) * 60 + Number(period.time.slice(3, 5)) : -1;
  const traditional = periods.filter((period) => period.gameName === "Quiniela Correntina" && period.time);
  const timed = traditional.length ? traditional : periods.filter((period) => period.time);
  if (timed.length) {
    return timed.reduce((latest, current) => minutes(current) > minutes(latest) ? current : latest);
  }
  return periods.find((period) => period.kind === "daily") ?? periods[0] ?? null;
}

export function getDrawPeriodStatus(
  period: OfficialDrawPeriod,
  businessDate: string,
  activeRendition: { id: string; game_period?: string | null } | null,
  savedStatus: { status?: string | null; rendition_id?: string | null; notes?: string | null } | null,
  now: Date = new Date(),
): { status: DrawPeriodStatus; label: string; description: string; hasRendition: boolean } {
  if (activeRendition) {
    if (savedStatus && String(savedStatus.rendition_id) === String(activeRendition.id)) {
      if (savedStatus.status === "complete") {
        return { status: "complete", label: "Rendida: " + period.shortLabel, description: "La rendición de " + period.label + " fue confirmada.", hasRendition: true };
      }
      if (savedStatus.status === "incomplete") {
        return { status: "incomplete", label: "Incompleta: " + period.shortLabel, description: String(savedStatus.notes || ("La rendición de " + period.label + " quedó incompleta.")), hasRendition: true };
      }
    }
    return { status: "review", label: "Revisar: " + period.shortLabel, description: "Hay una rendición registrada para este turno, pero falta confirmar su estado por sorteo. No se reasignó automáticamente.", hasRendition: true };
  }
  if (!period.time) {
    return { status: "pending", label: "Pendiente diaria: " + period.shortLabel, description: "Al Toque no tiene un horario fijo de sorteo: se controla como acumulado diario independiente.", hasRendition: false };
  }
  if (drawPeriodHasPassed(period, businessDate, now)) {
    return { status: "pending", label: "PENDIENTE: " + period.shortLabel, description: "El sorteo ya pasó y todavía no tiene una rendición registrada para este operador.", hasRendition: false };
  }
  return { status: "upcoming", label: "Próxima: " + period.shortLabel + " " + period.time, description: "Este sorteo todavía no llegó a su horario publicado.", hasRendition: false };
}
