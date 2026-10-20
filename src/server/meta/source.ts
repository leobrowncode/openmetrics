import type { DateRange } from "@/lib/periods";
import { createGraphClient, type GraphClient, type GraphClientOptions } from "./graph-client";

/** Shape of one row returned by GET /act_{id}/insights?level=campaign&time_increment=1. */
export interface RawInsightRow {
  campaign_id: string;
  campaign_name?: string;
  objective?: string;
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

export interface MetaAdAccountInfo {
  metaAccountId: string;
  name: string;
  currency: string;
  timezoneName: string;
  accountStatus: number | null;
}

export interface InsightsSource {
  listAdAccounts(): Promise<MetaAdAccountInfo[]>;
  getAdAccount(metaAccountId: string): Promise<MetaAdAccountInfo>;
  fetchCampaignDailyInsights(metaAccountId: string, range: DateRange): Promise<RawInsightRow[]>;
  readonly apiCalls: number;
}

export const INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "objective",
  "date_start",
  "date_stop",
  "spend",
  "impressions",
  "clicks",
  "inline_link_clicks",
  "actions",
  "action_values",
] as const;

const ACCOUNT_FIELDS = "account_id,name,currency,timezone_name,account_status";

interface RawAccount {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
}

function toAccountInfo(raw: RawAccount): MetaAdAccountInfo {
  return {
    metaAccountId: raw.id.startsWith("act_") ? raw.id : `act_${raw.account_id ?? raw.id}`,
    name: raw.name ?? raw.id,
    currency: raw.currency ?? "EUR",
    timezoneName: raw.timezone_name ?? "Europe/Paris",
    accountStatus: raw.account_status ?? null,
  };
}

export function assertMetaAccountId(value: string): string {
  if (!/^act_\d{1,20}$/.test(value)) throw new Error(`Invalid Meta ad account id: ${value}`);
  return value;
}

/**
 * Real Meta source. No attribution parameters are sent: since January 2026 the
 * Insights API applies the ad account's attribution settings, as Ads Manager does.
 */
export function createMetaSource(options: GraphClientOptions): InsightsSource & { client: GraphClient } {
  const client = createGraphClient(options);
  return {
    client,
    get apiCalls() {
      return client.callCount;
    },
    async listAdAccounts() {
      const rows = await client.getAll<RawAccount>("me/adaccounts", { fields: ACCOUNT_FIELDS, limit: 100 });
      return rows.map(toAccountInfo);
    },
    async getAdAccount(metaAccountId) {
      const raw = await client.get<RawAccount>(assertMetaAccountId(metaAccountId), { fields: ACCOUNT_FIELDS });
      return toAccountInfo(raw);
    },
    async fetchCampaignDailyInsights(metaAccountId, range) {
      return client.getAll<RawInsightRow>(`${assertMetaAccountId(metaAccountId)}/insights`, {
        level: "campaign",
        time_increment: 1,
        time_range: { since: range.from, until: range.to },
        fields: INSIGHT_FIELDS.join(","),
        limit: 500,
      });
    },
  };
}

export async function fetchGrantedPermissions(client: GraphClient): Promise<string[]> {
  const rows = await client.getAll<{ permission: string; status: string }>("me/permissions");
  return rows.filter((r) => r.status === "granted").map((r) => r.permission);
}
