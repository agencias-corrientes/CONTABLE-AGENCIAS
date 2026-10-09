const AGENCY_TIME_ZONE = "America/Argentina/Cordoba";

function agencyDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGENCY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day" | "hour" | "minute") =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

function toDateString(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayInAgencyTimeZone(): string {
  const parts = agencyDateParts(new Date());
  return toDateString(parts.year, parts.month, parts.day);
}

/** Business day starts at the configured local cutoff time; it never deletes prior renditions. */
export function agencyBusinessDateForCutoff(cutoffTime = "00:00", value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return todayInAgencyTimeZone();
  const parts = agencyDateParts(date);
  const [cutoffHourRaw, cutoffMinuteRaw] = String(cutoffTime || "00:00").slice(0, 5).split(":");
  const cutoffHour = Number(cutoffHourRaw || 0);
  const cutoffMinute = Number(cutoffMinuteRaw || 0);
  const currentMinuteOfDay = parts.hour * 60 + parts.minute;
  const cutoffMinuteOfDay = cutoffHour * 60 + cutoffMinute;
  if (currentMinuteOfDay >= cutoffMinuteOfDay) {
    return toDateString(parts.year, parts.month, parts.day);
  }
  const previousDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 24 * 60 * 60 * 1000);
  return toDateString(previousDay.getUTCFullYear(), previousDay.getUTCMonth() + 1, previousDay.getUTCDate());
}

export function formatAgencyDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: AGENCY_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}


/** Format a date-only value as DD/MM/YYYY without timezone conversion. */
export function formatAgencyDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-AR", { timeZone: AGENCY_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
