import "server-only";
import { parseDashboardConfig, type DashboardConfig } from "@/lib/dashboard-config";
import {
  addDays,
  isPeriodPreset,
  resolvePreset,
  todayInTimezone,
  validateRange,
  type DateRange,
  type PeriodPreset,
} from "@/lib/periods";
import type { Db } from "../db/client";
import type { dashboards } from "../db/schema";
import { dashboardAccountScope, getDashboardData, type DashboardData } from "./data";

type Dashboard = typeof dashboards.$inferSelect;

export interface DashboardQuery {
  period: PeriodPreset | "custom" | "since_start";
  range: DateRange;
  campaignIds: string[];
}

export interface DashboardPayload {
  query: DashboardQuery;
  data: DashboardData;
}

const MAX_CAMPAIGN_FILTER = 200;

/**
 * Turns URL parameters into a query. In viewer mode, filters the admin did not
 * allow are ignored and the dashboard defaults apply.
 */
export function parseDashboardQuery(
  params: URLSearchParams,
  config: DashboardConfig,
  timezoneName: string,
  mode: "viewer" | "admin",
): DashboardQuery | { error: string } {
  const canChangePeriod = mode === "admin" || config.viewer.allowPeriodChange;
  const canFilterCampaigns = mode === "admin" || config.viewer.allowCampaignFilter;
  const today = todayInTimezone(timezoneName);

  let period: DashboardQuery["period"] = config.defaultPeriod;
  let range = resolvePreset(config.defaultPeriod, today);
  const requested = params.get("period");
  if (canChangePeriod && requested) {
    if (requested === "custom") {
      const custom = { from: params.get("from") ?? "", to: params.get("to") ?? "" };
      const error = validateRange(custom);
      if (error) return { error };
      period = "custom";
      range = custom;
    } else if (requested === "since_start") {
      period = "since_start";
      const yesterday = addDays(today, -1);
      range = { from: yesterday, to: yesterday };
    } else if (isPeriodPreset(requested)) {
      period = requested;
      range = resolvePreset(requested, today);
    } else {
      return { error: "Période inconnue." };
    }
  }

  const campaignIds = canFilterCampaigns
    ? (params.get("campaigns") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d{1,30}$/.test(s))
        .slice(0, MAX_CAMPAIGN_FILTER)
    : [];

  return { period, range, campaignIds };
}

export interface DashboardLock {
  range: DateRange;
  campaignIds: string[];
}

/** A bilan ignores the URL: its dates and campaigns stay those saved at creation. */
export function lockedDashboardQuery(lock: DashboardLock): DashboardQuery | { error: string } {
  const error = validateRange(lock.range);
  if (error) return { error };
  return { period: "custom", range: lock.range, campaignIds: lock.campaignIds };
}

export async function loadDashboardPayload(
  db: Db,
  dashboard: Dashboard,
  params: URLSearchParams,
  mode: "viewer" | "admin",
  lock?: DashboardLock,
): Promise<DashboardPayload | { error: string }> {
  const config = parseDashboardConfig(dashboard.config);
  const accounts = await dashboardAccountScope(db, dashboard);
  const timezoneName = accounts[0]?.timezoneName ?? "Europe/Paris";
  const query = lock ? lockedDashboardQuery(lock) : parseDashboardQuery(params, config, timezoneName, mode);
  if ("error" in query) return query;
  const data = await getDashboardData(db, dashboard, {
    range: query.range,
    campaignIds: query.campaignIds,
    compare: config.compareToPreviousPeriod,
    sinceStart: query.period === "since_start",
  });
  if (query.period === "since_start") query.range = data.range;
  return { query, data };
}
