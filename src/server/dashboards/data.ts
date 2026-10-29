import "server-only";
import { and, asc, between, eq, inArray, sql } from "drizzle-orm";
import { describeConversionActions, type ConversionDisplay } from "@/lib/conversion-actions";
import { includeAccountInDashboard } from "@/lib/synthetic-display";
import { addSums, emptySums, type Sums } from "@/lib/metrics";
import { formatDateFr, previousPeriod, type DateRange } from "@/lib/periods";
import type { Db } from "../db/client";
import { adAccounts, campaigns, dashboards, insightsDaily, metaConnections } from "../db/schema";
import { getSyntheticDisplay, hasRealMetaAccount } from "../settings/synthetic";

export interface CampaignOption {
  id: string;
  name: string;
  accountName: string;
}

export interface DashboardData {
  range: DateRange;
  previousRange: DateRange | null;
  currency: string;
  timezoneName: string;
  /** Oldest successful sync among the dashboard's accounts (conservative freshness). */
  lastSyncedAt: string | null;
  accounts: Array<{ id: string; name: string }>;
  campaigns: CampaignOption[];
  selectedCampaignIds: string[];
  totals: Sums;
  previousTotals: Sums | null;
  series: Array<{ date: string } & Sums>;
  byCampaign: Array<{ campaignId: string; name: string } & Sums>;
  warnings: string[];
  conversion: ConversionDisplay;
}

type Dashboard = typeof dashboards.$inferSelect;

/**
 * Ad accounts a dashboard may read: always restricted to the dashboard's own client.
 * Synthetic accounts are left out once that client has a real Meta account, or when
 * the instance hides synthetic data.
 */
export async function dashboardAccountScope(db: Db, dashboard: Dashboard) {
  return (await loadDashboardAccounts(db, dashboard)).accounts;
}

async function loadDashboardAccounts(db: Db, dashboard: Dashboard) {
  const rows = await db
    .select({ account: adAccounts, kind: metaConnections.kind })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(and(eq(adAccounts.clientId, dashboard.clientId), eq(adAccounts.isActive, true)))
    .orderBy(asc(adAccounts.name));
  const subset = dashboard.adAccountIds ?? [];
  const selected = subset.length ? rows.filter((row) => subset.includes(row.account.id)) : rows;
  const display = await getSyntheticDisplay(db);
  const clientHasRealAccount = selected.some((row) => row.kind === "meta");
  const instanceHasRealAccount = display === "auto" ? clientHasRealAccount || (await hasRealMetaAccount(db)) : false;
  const accounts = selected
    .filter((row) =>
      includeAccountInDashboard({
        kind: row.kind,
        display,
        instanceHasRealAccount,
        clientHasRealAccount,
      }),
    )
    .map((row) => row.account);
  const syntheticOmitted = accounts.length !== selected.length;
  return { accounts, syntheticOmitted };
}

const sums = {
  spend: sql<number>`coalesce(sum(${insightsDaily.spend}), 0)::float8`,
  impressions: sql<number>`coalesce(sum(${insightsDaily.impressions}), 0)::float8`,
  clicks: sql<number>`coalesce(sum(${insightsDaily.clicks}), 0)::float8`,
  linkClicks: sql<number>`coalesce(sum(${insightsDaily.linkClicks}), 0)::float8`,
  conversions: sql<number>`coalesce(sum(${insightsDaily.conversions}), 0)::float8`,
  conversionValue: sql<number>`coalesce(sum(${insightsDaily.conversionValue}), 0)::float8`,
};

function toSums(row: Record<keyof Sums, unknown>): Sums {
  return {
    spend: Number(row.spend),
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    linkClicks: Number(row.linkClicks),
    conversions: Number(row.conversions),
    conversionValue: Number(row.conversionValue),
  };
}

export async function getDashboardData(
  db: Db,
  dashboard: Dashboard,
  query: { range: DateRange; campaignIds?: string[]; compare: boolean },
): Promise<DashboardData> {
  const { accounts, syntheticOmitted } = await loadDashboardAccounts(db, dashboard);
  const accountIds = accounts.map((a) => a.id);
  const warnings: string[] = [];
  if (syntheticOmitted) {
    warnings.push(
      accounts.length === 0
        ? "Les données synthétiques sont masquées. Reliez un compte Meta réel, ou réactivez l'affichage dans Connexions Meta."
        : "Les comptes de démonstration sont exclus : ce client a un compte Meta réel.",
    );
  }

  const currencies = [...new Set(accounts.map((a) => a.currency))];
  const timezones = [...new Set(accounts.map((a) => a.timezoneName))];
  if (currencies.length > 1) {
    warnings.push(
      `Les comptes de ce dashboard utilisent plusieurs devises (${currencies.join(", ")}) : les montants ne peuvent pas être additionnés.`,
    );
  }
  if (timezones.length > 1) {
    warnings.push(`Les comptes utilisent plusieurs fuseaux horaires (${timezones.join(", ")}) : les jours ne sont pas alignés.`);
  }
  const conversion = describeConversionActions(accounts.map((a) => ({ name: a.name, types: a.conversionActionTypes })));
  if (accounts.some((a) => a.conversionActionTypes.length === 0)) {
    warnings.push("Le type de conversion n'est pas configuré pour au moins un compte : les conversions affichées sont à 0.");
  }
  if (conversion.warning) warnings.push(conversion.warning);

  const previousRange = query.compare ? previousPeriod(query.range) : null;
  const earliestNeeded = previousRange?.from ?? query.range.from;
  const incomplete = accounts.filter((a) => !a.historyFrom || a.historyFrom > earliestNeeded);
  if (incomplete.length > 0) {
    const available = incomplete.map((a) => a.historyFrom);
    warnings.push(
      available.some((d) => d === null)
        ? "Import de l'historique en cours : les chiffres sont encore incomplets."
        : `Données disponibles à partir du ${formatDateFr(available.sort().at(-1)!)} seulement : les jours antérieurs ne sont pas comptés${previousRange ? " (période de comparaison incluse)" : ""}.`,
    );
  }

  const base = {
    range: query.range,
    previousRange,
    currency: currencies[0] ?? "EUR",
    timezoneName: timezones[0] ?? "Europe/Paris",
    lastSyncedAt: null as string | null,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    campaigns: [] as CampaignOption[],
    selectedCampaignIds: [] as string[],
    totals: emptySums(),
    previousTotals: query.compare ? emptySums() : null,
    series: [] as DashboardData["series"],
    byCampaign: [] as DashboardData["byCampaign"],
    warnings,
    conversion,
  };
  if (accountIds.length === 0) {
    if (!syntheticOmitted) warnings.push("Aucun compte publicitaire actif n'est associé à ce dashboard.");
    return base;
  }
  if (currencies.length > 1) return base;

  const syncDates = accounts.map((a) => a.lastSyncedAt);
  base.lastSyncedAt = syncDates.some((d) => d === null)
    ? null
    : new Date(Math.min(...syncDates.map((d) => d!.getTime()))).toISOString();

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const campaignRows = await db
    .select({ adAccountId: campaigns.adAccountId, id: campaigns.metaCampaignId, name: campaigns.name })
    .from(campaigns)
    .where(inArray(campaigns.adAccountId, accountIds))
    .orderBy(asc(campaigns.name));
  base.campaigns = campaignRows.map((c) => ({ id: c.id, name: c.name, accountName: accountName.get(c.adAccountId) ?? "" }));

  // Requested campaigns are intersected with the dashboard scope; unknown ids are dropped.
  const allowed = new Set(base.campaigns.map((c) => c.id));
  const requested = query.campaignIds?.filter((id) => allowed.has(id)) ?? [];
  const filteringRequested = (query.campaignIds?.length ?? 0) > 0;
  base.selectedCampaignIds = requested;
  if (filteringRequested && requested.length === 0) return base;

  const where = (range: DateRange) =>
    and(
      inArray(insightsDaily.adAccountId, accountIds),
      between(insightsDaily.date, range.from, range.to),
      requested.length ? inArray(insightsDaily.metaCampaignId, requested) : undefined,
    );

  const seriesRows = await db
    .select({ date: insightsDaily.date, ...sums })
    .from(insightsDaily)
    .where(where(query.range))
    .groupBy(insightsDaily.date)
    .orderBy(asc(insightsDaily.date));
  base.series = seriesRows.map((r) => ({ date: r.date, ...toSums(r) }));
  base.totals = base.series.reduce((acc, row) => addSums(acc, row), emptySums());

  if (base.previousRange) {
    const [prev] = await db.select(sums).from(insightsDaily).where(where(base.previousRange));
    base.previousTotals = prev ? toSums(prev) : emptySums();
  }

  const campaignName = new Map(base.campaigns.map((c) => [c.id, c.name]));
  const byCampaignRows = await db
    .select({ campaignId: insightsDaily.metaCampaignId, ...sums })
    .from(insightsDaily)
    .where(where(query.range))
    .groupBy(insightsDaily.metaCampaignId)
    .orderBy(sql`2 desc`);
  base.byCampaign = byCampaignRows.map((r) => ({
    campaignId: r.campaignId,
    name: campaignName.get(r.campaignId) ?? r.campaignId,
    ...toSums(r),
  }));

  return base;
}
