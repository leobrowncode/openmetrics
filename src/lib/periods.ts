/**
 * Reporting periods. Dates are calendar days ("YYYY-MM-DD") in the ad account
 * timezone, which is how Meta buckets insights with time_increment=1.
 * Relative presets exclude today, matching Ads Manager ("7 derniers jours").
 */

export const PERIOD_PRESETS = [
  "last_7_days",
  "last_14_days",
  "last_30_days",
  "last_90_days",
  "this_month",
  "last_month",
  "this_year",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  last_7_days: "7 derniers jours",
  last_14_days: "14 derniers jours",
  last_30_days: "30 derniers jours",
  last_90_days: "90 derniers jours",
  this_month: "Ce mois-ci",
  last_month: "Mois dernier",
  this_year: "Cette année",
};

export interface DateRange {
  from: string;
  to: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isPeriodPreset(value: unknown): value is PeriodPreset {
  return typeof value === "string" && (PERIOD_PRESETS as readonly string[]).includes(value);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(range: DateRange): number {
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Current calendar date in an IANA timezone. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function resolvePreset(preset: PeriodPreset, today: string): DateRange {
  const yesterday = addDays(today, -1);
  const [y, m] = today.split("-").map(Number);
  const firstOfMonth = `${y}-${String(m).padStart(2, "0")}-01`;
  switch (preset) {
    case "last_7_days":
      return { from: addDays(today, -7), to: yesterday };
    case "last_14_days":
      return { from: addDays(today, -14), to: yesterday };
    case "last_30_days":
      return { from: addDays(today, -30), to: yesterday };
    case "last_90_days":
      return { from: addDays(today, -90), to: yesterday };
    case "this_month":
      // On the 1st, "this month" only contains today, which has partial data.
      return today === firstOfMonth
        ? { from: today, to: today }
        : { from: firstOfMonth, to: yesterday };
    case "last_month": {
      const lastDayPrev = addDays(firstOfMonth, -1);
      return { from: `${lastDayPrev.slice(0, 7)}-01`, to: lastDayPrev };
    }
    case "this_year":
      return today === `${y}-01-01`
        ? { from: today, to: today }
        : { from: `${y}-01-01`, to: yesterday };
  }
}

/** Period of identical length immediately preceding the given one. */
export function previousPeriod(range: DateRange): DateRange {
  const length = daysBetweenInclusive(range);
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

export const MAX_RANGE_DAYS = 366 * 3;

/**
 * Starts `to`'s range on the first stored day. Keeps the chosen end, and
 * never exceeds {@link MAX_RANGE_DAYS}. If the end is before the first day,
 * the range is that single day.
 */
export function rangeFromFirstData(firstData: string, to: string): DateRange {
  if (!isIsoDate(firstData) || !isIsoDate(to)) return { from: firstData, to };
  const end = to < firstData ? firstData : to;
  const earliestAllowed = addDays(end, -(MAX_RANGE_DAYS - 1));
  const from = firstData < earliestAllowed ? earliestAllowed : firstData;
  return { from, to: end };
}

export function validateRange(range: DateRange): string | null {
  if (!isIsoDate(range.from) || !isIsoDate(range.to)) return "Dates invalides.";
  if (range.from > range.to) return "La date de début doit précéder la date de fin.";
  if (daysBetweenInclusive(range) > MAX_RANGE_DAYS) return "Période trop longue (3 ans maximum).";
  return null;
}

export function formatDateFr(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
