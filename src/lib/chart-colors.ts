import { z } from "zod";

/** Dark-to-light shades that stay readable as a 2px stroke on white. */
export const CHART_COLOR_GROUPS = [
  { id: "blue", label: "Bleu", shades: ["#1e3a8a", "#1e40af", "#1d4ed8", "#2753d8", "#3b82f6"] },
  { id: "teal", label: "Turquoise", shades: ["#134e4a", "#115e59", "#0f766e", "#0d9488", "#14b8a6"] },
  { id: "green", label: "Vert", shades: ["#14532d", "#166534", "#15803d", "#10b981", "#22c55e"] },
  { id: "amber", label: "Ambre", shades: ["#78350f", "#92400e", "#b45309", "#d97706", "#f59e0b"] },
  { id: "orange", label: "Orange", shades: ["#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316"] },
  { id: "red", label: "Rouge", shades: ["#7f1d1d", "#991b1b", "#b91c1c", "#dc2626", "#ef4444"] },
  { id: "rose", label: "Rose", shades: ["#831843", "#9d174d", "#be185d", "#db2777", "#ec4899"] },
  { id: "violet", label: "Violet", shades: ["#4c1d95", "#5b21b6", "#6d28d9", "#7c3aed", "#8b5cf6"] },
  { id: "slate", label: "Ardoise", shades: ["#0f172a", "#1e293b", "#334155", "#475569", "#64748b"] },
] as const;

export const CHART_PALETTE: readonly string[] = CHART_COLOR_GROUPS.flatMap((group) => [...group.shades]);

const palette = new Set(CHART_PALETTE);

/** First series, then second. Matches the historical blue / amber chart colors. */
export const DEFAULT_CHART_COLORS = ["#2753d8", "#f59e0b"] as const;

export const CHART_SERIES_LABELS = ["Courbe 1", "Courbe 2"] as const;

const chartColor = z.string().refine((value) => palette.has(value), "Couleur hors palette");

function defaultChartColors(): [string, string] {
  return [DEFAULT_CHART_COLORS[0], DEFAULT_CHART_COLORS[1]];
}

export const chartColorsSchema = z.tuple([chartColor, chartColor]).default(defaultChartColors);

export function colorsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((color, index) => color === b[index]);
}
