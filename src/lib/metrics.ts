/**
 * KPI definitions shared by the server (aggregation) and the browser (display).
 *
 * Only additive base measures are stored and summed. Every ratio is computed
 * from summed bases ("ratio of sums"), never by averaging daily ratios, so the
 * values stay correct for any period, campaign selection or time bucket.
 * Non-additive Meta fields (reach, frequency, unique_*) are deliberately absent:
 * they cannot be summed across days or campaigns.
 */

export const BASE_MEASURES = [
  "spend",
  "impressions",
  "clicks",
  "linkClicks",
  "conversions",
  "conversionValue",
] as const;

export type BaseMeasure = (typeof BASE_MEASURES)[number];
export type Sums = Record<BaseMeasure, number>;

export const emptySums = (): Sums => ({
  spend: 0,
  impressions: 0,
  clicks: 0,
  linkClicks: 0,
  conversions: 0,
  conversionValue: 0,
});

export function addSums(target: Sums, source: Partial<Sums>): Sums {
  for (const key of BASE_MEASURES) {
    target[key] += source[key] ?? 0;
  }
  return target;
}

export type MetricUnit = "currency" | "integer" | "decimal" | "percent" | "ratio";

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: MetricUnit;
  /** Meta Ads Manager equivalent, used to cross-check values. */
  adsManagerColumn: string;
  description: string;
  /** Higher is better (used for delta colouring). */
  higherIsBetter: boolean;
  compute: (s: Sums) => number | null;
}

const ratio = (num: number, den: number, factor = 1): number | null =>
  den > 0 ? (num / den) * factor : null;

export const METRICS = {
  spend: {
    label: "Montant dépensé",
    shortLabel: "Dépenses",
    unit: "currency",
    adsManagerColumn: "Montant dépensé (spend)",
    description: "Montant total dépensé, dans la devise du compte publicitaire.",
    higherIsBetter: true,
    compute: (s) => s.spend,
  },
  impressions: {
    label: "Impressions",
    shortLabel: "Impressions",
    unit: "integer",
    adsManagerColumn: "Impressions",
    description: "Nombre d'affichages des publicités.",
    higherIsBetter: true,
    compute: (s) => s.impressions,
  },
  clicks: {
    label: "Clics (tous)",
    shortLabel: "Clics (tous)",
    unit: "integer",
    adsManagerColumn: "Clics (tous)",
    description:
      "Tous les clics sur la publicité : liens, profil, réactions, agrandissement du média, etc.",
    higherIsBetter: true,
    compute: (s) => s.clicks,
  },
  linkClicks: {
    label: "Clics sur un lien",
    shortLabel: "Clics lien",
    unit: "integer",
    adsManagerColumn: "Clics sur un lien (inline_link_clicks)",
    description: "Clics menant vers une destination (site, formulaire, application).",
    higherIsBetter: true,
    compute: (s) => s.linkClicks,
  },
  ctr: {
    label: "CTR (tous)",
    shortLabel: "CTR (tous)",
    unit: "percent",
    adsManagerColumn: "CTR (tous)",
    description: "Clics (tous) ÷ impressions.",
    higherIsBetter: true,
    compute: (s) => ratio(s.clicks, s.impressions, 100),
  },
  linkCtr: {
    label: "CTR (taux de clics sur le lien)",
    shortLabel: "CTR lien",
    unit: "percent",
    adsManagerColumn: "CTR (taux de clics sur le lien)",
    description: "Clics sur un lien ÷ impressions.",
    higherIsBetter: true,
    compute: (s) => ratio(s.linkClicks, s.impressions, 100),
  },
  cpc: {
    label: "CPC (tous)",
    shortLabel: "CPC (tous)",
    unit: "currency",
    adsManagerColumn: "CPC (tous)",
    description: "Montant dépensé ÷ clics (tous).",
    higherIsBetter: false,
    compute: (s) => ratio(s.spend, s.clicks),
  },
  linkCpc: {
    label: "CPC (coût par clic sur un lien)",
    shortLabel: "CPC lien",
    unit: "currency",
    adsManagerColumn: "CPC (coût par clic sur un lien)",
    description: "Montant dépensé ÷ clics sur un lien.",
    higherIsBetter: false,
    compute: (s) => ratio(s.spend, s.linkClicks),
  },
  cpm: {
    label: "CPM (coût pour 1 000 impressions)",
    shortLabel: "CPM",
    unit: "currency",
    adsManagerColumn: "CPM (coût pour 1 000 impressions)",
    description: "(Montant dépensé ÷ impressions) × 1 000.",
    higherIsBetter: false,
    compute: (s) => ratio(s.spend, s.impressions, 1000),
  },
  conversions: {
    label: "Conversions",
    shortLabel: "Conversions",
    unit: "decimal",
    adsManagerColumn: "Résultats / actions du type de conversion configuré",
    description:
      "Somme des actions Meta du type de conversion configuré pour le compte, selon le paramètre d'attribution du compte.",
    higherIsBetter: true,
    compute: (s) => s.conversions,
  },
  conversionValue: {
    label: "Valeur de conversion",
    shortLabel: "Valeur conv.",
    unit: "currency",
    adsManagerColumn: "Valeur de conversion (action_values)",
    description: "Somme des valeurs associées aux conversions configurées.",
    higherIsBetter: true,
    compute: (s) => s.conversionValue,
  },
  cvr: {
    label: "Taux de conversion (CVR)",
    shortLabel: "CVR",
    unit: "percent",
    adsManagerColumn: "Non natif : conversions ÷ clics sur un lien",
    description: "Conversions ÷ clics sur un lien.",
    higherIsBetter: true,
    compute: (s) => ratio(s.conversions, s.linkClicks, 100),
  },
  cpa: {
    label: "Coût par conversion",
    shortLabel: "CPA",
    unit: "currency",
    adsManagerColumn: "Coût par résultat",
    description: "Montant dépensé ÷ conversions.",
    higherIsBetter: false,
    compute: (s) => ratio(s.spend, s.conversions),
  },
  roas: {
    label: "ROAS (rentabilité)",
    shortLabel: "ROAS",
    unit: "ratio",
    adsManagerColumn: "ROAS des achats",
    description: "Valeur de conversion ÷ montant dépensé.",
    higherIsBetter: true,
    compute: (s) => ratio(s.conversionValue, s.spend),
  },
} satisfies Record<string, Omit<MetricDefinition, "key">>;

export type MetricKey = keyof typeof METRICS;

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export function isMetricKey(value: unknown): value is MetricKey {
  return typeof value === "string" && value in METRICS;
}

export function getMetric(key: MetricKey): MetricDefinition {
  return { key, ...METRICS[key] };
}

export function computeMetric(key: MetricKey, sums: Sums): number | null {
  return METRICS[key].compute(sums);
}

/** Relative change between two values, or null when it is not meaningful. */
export function relativeDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function formatMetric(
  key: MetricKey,
  value: number | null,
  currency: string,
  locale = "fr-FR",
): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const unit = METRICS[key].unit;
  switch (unit) {
    case "currency":
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    case "integer":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
    case "decimal":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
    case "percent":
      return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)} %`;
    case "ratio":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value);
  }
}
