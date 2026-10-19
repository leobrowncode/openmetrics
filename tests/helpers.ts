import { REFERENCE_TEMPLATE_CONFIG } from "@/lib/dashboard-config";
import { createPgliteDb, type Db } from "@/server/db/client";
import { adAccounts, clients, dashboards, metaConnections } from "@/server/db/schema";
import type { InsightsSource, RawInsightRow } from "@/server/meta/source";

export async function testDb(): Promise<Db> {
  return createPgliteDb();
}

export async function seedClient(db: Db, name: string, metaAccountId: string, connectionKind: "demo" | "meta" = "demo") {
  const [connection] = await db
    .insert(metaConnections)
    .values({ label: `${name} connection`, kind: connectionKind })
    .returning();
  const [client] = await db.insert(clients).values({ name }).returning();
  const [account] = await db
    .insert(adAccounts)
    .values({
      clientId: client.id,
      connectionId: connection.id,
      metaAccountId,
      name: `${name} account`,
      currency: "EUR",
      timezoneName: "Europe/Paris",
      conversionActionTypes: ["offsite_conversion.fb_pixel_purchase"],
    })
    .returning();
  const [dashboard] = await db
    .insert(dashboards)
    .values({ clientId: client.id, name: `${name} dashboard`, config: REFERENCE_TEMPLATE_CONFIG })
    .returning();
  return { connection, client, account, dashboard };
}

export function fakeSource(rowsFor: (range: { from: string; to: string }) => RawInsightRow[] | Error): InsightsSource {
  let calls = 0;
  return {
    get apiCalls() {
      return calls;
    },
    async listAdAccounts() {
      return [];
    },
    async getAdAccount(id) {
      return { metaAccountId: id, name: id, currency: "EUR", timezoneName: "Europe/Paris", accountStatus: 1 };
    },
    async fetchCampaignDailyInsights(_id, range) {
      calls++;
      const result = rowsFor(range);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

export function insightRow(campaignId: string, date: string, spend: number, purchases = 0): RawInsightRow {
  return {
    campaign_id: campaignId,
    campaign_name: `Campaign ${campaignId}`,
    date_start: date,
    date_stop: date,
    spend: spend.toFixed(2),
    impressions: String(spend * 100),
    clicks: String(spend * 2),
    inline_link_clicks: String(spend),
    actions: purchases ? [{ action_type: "offsite_conversion.fb_pixel_purchase", value: String(purchases) }] : [],
    action_values: purchases ? [{ action_type: "offsite_conversion.fb_pixel_purchase", value: String(purchases * 50) }] : [],
  };
}
