import { computeMetric, formatMetric, getMetric, type MetricKey, type Sums } from "@/lib/metrics";
import { formatBucket, type Granularity } from "./aggregate";

export interface CampaignTableRow extends Sums {
  campaignId: string;
  name: string;
}

/** Text shown in the dashboard, with narrow spaces normalized for paste targets. */
export function clipboardMetric(key: MetricKey, sums: Sums, currency: string): string {
  return formatMetric(key, computeMetric(key, sums), currency).replace(/\u202F|\u00A0/g, " ");
}

const PERIOD_HEADER: Record<Granularity, string> = {
  day: "Date",
  week: "Semaine",
  month: "Mois",
};

/** One row per point drawn on a chart, with the same labels and formatted values. */
export function seriesTableMatrix(
  metrics: MetricKey[],
  buckets: Array<{ bucket: string } & Sums>,
  granularity: Granularity,
  currency: string,
): string[][] {
  const header = [PERIOD_HEADER[granularity], ...metrics.map((key) => getMetric(key).shortLabel)];
  const body = buckets.map((bucket) => [
    formatBucket(bucket.bucket, granularity),
    ...metrics.map((key) => clipboardMetric(key, bucket, currency)),
  ]);
  return [header, ...body];
}

export function campaignTableMatrix(
  metrics: MetricKey[],
  rows: CampaignTableRow[],
  totals: Sums,
  currency: string,
): string[][] {
  const header = ["Campagne", ...metrics.map((key) => getMetric(key).shortLabel)];
  const body = rows.map((row) => [row.name, ...metrics.map((key) => clipboardMetric(key, row, currency))]);
  const total = ["Total", ...metrics.map((key) => clipboardMetric(key, totals, currency))];
  return [header, ...body, total];
}

function escapeCell(value: string): string {
  const singleLine = value.replace(/\t/g, " ").replace(/\r?\n/g, " ");
  return /^[=+\-@]/.test(singleLine) ? `'${singleLine}` : singleLine;
}

export function matrixToTsv(matrix: string[][]): string {
  return matrix.map((row) => row.map(escapeCell).join("\t")).join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** HTML table plus tab-separated text, so a paste lands as a table in Sheets, Excel or Docs. */
export function matrixToClipboard(matrix: string[][]): { "text/plain": string; "text/html": string } {
  const [header, ...body] = matrix;
  const head = (header ?? []).map((cell) => `<th>${escapeHtml(escapeCell(cell))}</th>`).join("");
  const rows = body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(escapeCell(cell))}</td>`).join("")}</tr>`)
    .join("");
  return {
    "text/plain": matrixToTsv(matrix),
    "text/html": `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`,
  };
}

export async function writeTableClipboard(matrix: string[][]): Promise<void> {
  const payload = matrixToClipboard(matrix);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([payload["text/plain"]], { type: "text/plain" }),
        "text/html": new Blob([payload["text/html"]], { type: "text/html" }),
      }),
    ]);
    return;
  }
  await navigator.clipboard.writeText(payload["text/plain"]);
}
