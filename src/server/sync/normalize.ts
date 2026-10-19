import type { RawInsightRow } from "../meta/source";

export interface NormalizedInsight {
  metaCampaignId: string;
  campaignName: string;
  objective: string | null;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversions: number;
  conversionValue: number;
  rawActions: Record<string, number>;
  rawActionValues: Record<string, number>;
}

export class NormalizationError extends Error {}

function num(value: string | undefined, field: string, row: RawInsightRow): number {
  if (value === undefined || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new NormalizationError(
      `Valeur invalide pour ${field} (campagne ${row.campaign_id}, ${row.date_start}) : ${value}`,
    );
  }
  return n;
}

function actionMap(
  list: RawInsightRow["actions"],
  row: RawInsightRow,
  field: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of list ?? []) {
    if (!item?.action_type) continue;
    out[item.action_type] = (out[item.action_type] ?? 0) + num(item.value, `${field}.${item.action_type}`, row);
  }
  return out;
}

export function sumActionTypes(map: Record<string, number>, types: string[]): number {
  let total = 0;
  for (const type of new Set(types)) total += map[type] ?? 0;
  return total;
}

export function normalizeInsightRow(row: RawInsightRow, conversionActionTypes: string[]): NormalizedInsight {
  if (!row.campaign_id) throw new NormalizationError("Ligne Meta sans campaign_id.");
  if (row.date_start !== row.date_stop) {
    throw new NormalizationError(
      `Ligne non journalière reçue (${row.date_start} → ${row.date_stop}) : time_increment=1 attendu.`,
    );
  }
  const rawActions = actionMap(row.actions, row, "actions");
  const rawActionValues = actionMap(row.action_values, row, "action_values");
  const linkClicks =
    row.inline_link_clicks !== undefined
      ? num(row.inline_link_clicks, "inline_link_clicks", row)
      : (rawActions["link_click"] ?? 0);
  return {
    metaCampaignId: row.campaign_id,
    campaignName: row.campaign_name ?? row.campaign_id,
    objective: row.objective ?? null,
    date: row.date_start,
    spend: num(row.spend, "spend", row),
    impressions: Math.round(num(row.impressions, "impressions", row)),
    clicks: Math.round(num(row.clicks, "clicks", row)),
    linkClicks: Math.round(linkClicks),
    conversions: sumActionTypes(rawActions, conversionActionTypes),
    conversionValue: sumActionTypes(rawActionValues, conversionActionTypes),
    rawActions,
    rawActionValues,
  };
}

/**
 * Meta reports one event under several aliases (e.g. a pixel purchase appears
 * as `purchase`, `omni_purchase` and `offsite_conversion.fb_pixel_purchase`).
 * Selecting two aliases of the same event would double count conversions.
 */
const ALIAS_GROUPS: Array<{ label: string; types: string[] }> = [
  {
    label: "Achat",
    types: [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_web_purchase",
      "onsite_web_app_purchase",
      "web_in_store_purchase",
      "app_custom_event.fb_mobile_purchase",
      "onsite_conversion.purchase",
    ],
  },
  {
    label: "Prospect (lead)",
    types: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped", "onsite_conversion.lead"],
  },
  {
    label: "Inscription",
    types: ["complete_registration", "omni_complete_registration", "offsite_conversion.fb_pixel_complete_registration"],
  },
  {
    label: "Ajout au panier",
    types: ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"],
  },
  {
    label: "Paiement initié",
    types: ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"],
  },
];

export function findOverlappingActionTypes(types: string[]): Array<{ label: string; types: string[] }> {
  const selected = new Set(types);
  return ALIAS_GROUPS.map((g) => ({ label: g.label, types: g.types.filter((t) => selected.has(t)) })).filter(
    (g) => g.types.length > 1,
  );
}
