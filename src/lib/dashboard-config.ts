import { z } from "zod";
import { METRIC_KEYS, type MetricKey } from "./metrics";
import { PERIOD_PRESETS } from "./periods";

const metricKey = z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]]);

export const WIDGET_TYPES = ["kpi", "timeseries", "campaign_table"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  kpi: "Cartes KPI",
  timeseries: "Graphique temporel",
  campaign_table: "Tableau par campagne",
};

export const CHART_STYLES = ["line", "bar", "area"] as const;

export const widgetSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(WIDGET_TYPES),
  title: z.string().max(120).optional(),
  metrics: z.array(metricKey).min(1).max(8),
  chartStyle: z.enum(CHART_STYLES).optional(),
});

export const sectionSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  widgets: z.array(widgetSchema).max(12),
});

export const dashboardConfigSchema = z.object({
  version: z.literal(1),
  defaultPeriod: z.enum(PERIOD_PRESETS),
  compareToPreviousPeriod: z.boolean(),
  viewer: z.object({
    allowPeriodChange: z.boolean(),
    allowCampaignFilter: z.boolean(),
    /** The viewer may reorder and hide blocks. The choice stays on their device. */
    allowCustomize: z.boolean().default(true),
  }),
  sections: z.array(sectionSchema).max(20),
});

export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type DashboardSection = z.infer<typeof sectionSchema>;
export type DashboardWidget = z.infer<typeof widgetSchema>;

export function parseDashboardConfig(value: unknown): DashboardConfig {
  return dashboardConfigSchema.parse(value);
}

export function newId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Empty structure used when an admin creates a model from scratch. */
export function blankDashboardConfig(): DashboardConfig {
  return {
    version: 1,
    defaultPeriod: "last_30_days",
    compareToPreviousPeriod: true,
    viewer: { allowPeriodChange: true, allowCampaignFilter: true, allowCustomize: true },
    sections: [{ id: newId("sec"), title: "Nouvelle section", widgets: [] }],
  };
}

/** Reproduces the four sections of the agency's Looker Studio reference dashboard. */
export const REFERENCE_TEMPLATE_CONFIG: DashboardConfig = {
  version: 1,
  defaultPeriod: "last_30_days",
  compareToPreviousPeriod: true,
  viewer: { allowPeriodChange: true, allowCampaignFilter: true, allowCustomize: true },
  sections: [
    {
      id: "sec_invest",
      title: "Investissements",
      widgets: [
        { id: "w_invest_kpi", type: "kpi", metrics: ["spend"] },
        {
          id: "w_invest_chart",
          type: "timeseries",
          title: "Évolution du montant dépensé",
          metrics: ["spend"],
          chartStyle: "bar",
        },
      ],
    },
    {
      id: "sec_traffic",
      title: "Impressions et clics",
      widgets: [
        { id: "w_traffic_kpi", type: "kpi", metrics: ["impressions", "linkClicks", "clicks"] },
        {
          id: "w_traffic_chart",
          type: "timeseries",
          title: "Impressions et clics sur un lien",
          metrics: ["impressions", "linkClicks"],
          chartStyle: "line",
        },
      ],
    },
    {
      id: "sec_efficiency",
      title: "CTR et CPC",
      widgets: [
        { id: "w_eff_kpi", type: "kpi", metrics: ["linkCtr", "linkCpc", "cpm"] },
        {
          id: "w_eff_chart",
          type: "timeseries",
          title: "Évolution du CTR et du CPC",
          metrics: ["linkCtr", "linkCpc"],
          chartStyle: "line",
        },
      ],
    },
    {
      id: "sec_conversions",
      title: "Conversions",
      widgets: [
        {
          id: "w_conv_kpi",
          type: "kpi",
          metrics: ["conversions", "conversionValue", "cvr", "cpa", "roas"],
        },
        {
          id: "w_conv_chart",
          type: "timeseries",
          title: "Conversions et valeur de conversion",
          metrics: ["conversions", "conversionValue"],
          chartStyle: "bar",
        },
        {
          id: "w_conv_table",
          type: "campaign_table",
          title: "Performances par campagne",
          metrics: ["spend", "impressions", "linkClicks", "linkCtr", "linkCpc", "conversions", "cvr", "roas"],
        },
      ],
    },
  ],
};
