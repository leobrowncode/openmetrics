import { addSums, emptySums, type Sums } from "@/lib/metrics";
import { daysBetweenInclusive, eachDay, type DateRange } from "@/lib/periods";

export type Granularity = "day" | "week" | "month";

/**
 * Automatic charts use calendar days (`05/01`), then months past a year.
 * Week buckets (`sem. 05/01`) stay available when a caller asks for them.
 */
export function pickGranularity(range: DateRange): Granularity {
  const days = daysBetweenInclusive(range);
  if (days > 366) return "month";
  return "day";
}

function bucketKey(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return `${date.slice(0, 7)}-01`;
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Buckets daily sums, filling missing days with zeros so charts show real gaps. */
export function bucketSeries(
  series: Array<{ date: string } & Sums>,
  range: DateRange,
  granularity: Granularity,
): Array<{ bucket: string } & Sums> {
  const buckets = new Map<string, Sums>();
  for (const day of eachDay(range)) {
    const key = bucketKey(day, granularity);
    if (!buckets.has(key)) buckets.set(key, emptySums());
  }
  for (const row of series) {
    const key = bucketKey(row.date, granularity);
    addSums(buckets.get(key) ?? buckets.set(key, emptySums()).get(key)!, row);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, sums]) => ({ bucket, ...sums }));
}

export function formatBucket(bucket: string, granularity: Granularity): string {
  if (granularity === "month") {
    return new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(
      new Date(`${bucket}T00:00:00Z`),
    );
  }
  const [, m, d] = bucket.split("-");
  return granularity === "week" ? `sem. ${d}/${m}` : `${d}/${m}`;
}
