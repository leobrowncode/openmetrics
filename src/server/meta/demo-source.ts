import { eachDay } from "@/lib/periods";
import type { InsightsSource, MetaAdAccountInfo, RawInsightRow } from "./source";

/**
 * Deterministic synthetic Meta data for public demos. Values depend only on
 * (account, campaign, date), so re-syncing returns identical rows.
 */

interface DemoCampaign {
  id: string;
  name: string;
  objective: string;
  dailyBudget: number;
  cpm: number;
  ctrAll: number;
  linkShare: number;
  cvr: number;
  basket: number;
  start: string;
  end?: string;
}

interface DemoAccount extends MetaAdAccountInfo {
  campaigns: DemoCampaign[];
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    metaAccountId: "act_100000000000001",
    name: "Association Horizon - Dons (démo)",
    currency: "EUR",
    timezoneName: "Europe/Paris",
    accountStatus: 1,
    campaigns: [
      { id: "120200000000000101", name: "FDA - Broad - Dons", objective: "OUTCOME_SALES", dailyBudget: 85, cpm: 7.5, ctrAll: 0.021, linkShare: 0.55, cvr: 0.018, basket: 210, start: "2025-01-01" },
      { id: "120200000000000102", name: "FDA - Lookalike visiteurs 180j", objective: "OUTCOME_SALES", dailyBudget: 25, cpm: 9.8, ctrAll: 0.018, linkShare: 0.6, cvr: 0.022, basket: 240, start: "2025-01-01" },
      { id: "120200000000000103", name: "Notoriété - Vidéo témoignages", objective: "OUTCOME_AWARENESS", dailyBudget: 30, cpm: 3.2, ctrAll: 0.009, linkShare: 0.3, cvr: 0.002, basket: 90, start: "2025-03-01" },
    ],
  },
  {
    metaAccountId: "act_100000000000002",
    name: "Maison Lumen - E-commerce (démo)",
    currency: "EUR",
    timezoneName: "Europe/Paris",
    accountStatus: 1,
    campaigns: [
      { id: "120200000000000201", name: "Advantage+ Shopping - Catalogue", objective: "OUTCOME_SALES", dailyBudget: 140, cpm: 11.5, ctrAll: 0.024, linkShare: 0.65, cvr: 0.031, basket: 68, start: "2025-01-01" },
      { id: "120200000000000202", name: "Retargeting - Paniers abandonnés", objective: "OUTCOME_SALES", dailyBudget: 35, cpm: 15.0, ctrAll: 0.032, linkShare: 0.7, cvr: 0.055, basket: 74, start: "2025-01-01" },
      { id: "120200000000000203", name: "Prospection - Intérêts déco", objective: "OUTCOME_TRAFFIC", dailyBudget: 50, cpm: 6.4, ctrAll: 0.017, linkShare: 0.62, cvr: 0.008, basket: 61, start: "2025-02-15" },
      { id: "120200000000000204", name: "Leads - Newsletter -10 %", objective: "OUTCOME_LEADS", dailyBudget: 20, cpm: 8.1, ctrAll: 0.02, linkShare: 0.5, cvr: 0.0, basket: 0, start: "2025-04-01" },
    ],
  },
];

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rand: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (rand() + rand() + rand() - 1.5) * 1.4));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limit);
  return k - 1;
}

function dayRow(accountId: string, c: DemoCampaign, date: string): RawInsightRow | null {
  if (date < c.start || (c.end && date > c.end)) return null;
  const rand = rng(hash(`${accountId}|${c.id}|${date}`));
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = d.getUTCDay();
  const month = d.getUTCMonth();
  const weekFactor = weekday === 0 || weekday === 6 ? 0.85 : 1.05;
  const seasonFactor = month === 10 || month === 11 ? 1.45 : month === 7 ? 0.75 : 1;
  const noise = 0.8 + rand() * 0.4;
  const spend = Math.round(c.dailyBudget * weekFactor * seasonFactor * noise * 100) / 100;
  const impressions = Math.round((spend / c.cpm) * 1000 * (0.9 + rand() * 0.2));
  const clicks = poisson(impressions * c.ctrAll * (0.85 + rand() * 0.3), rand);
  const linkClicks = Math.min(clicks, poisson(clicks * c.linkShare, rand));
  const landingViews = Math.round(linkClicks * (0.7 + rand() * 0.15));
  const purchases = poisson(linkClicks * c.cvr * (month === 11 ? 1.6 : 1), rand);
  const purchaseValue = Math.round(purchases * c.basket * (0.75 + rand() * 0.5) * 100) / 100;
  const leads = c.objective === "OUTCOME_LEADS" ? poisson(linkClicks * 0.12, rand) : 0;

  const actions: Array<{ action_type: string; value: string }> = [
    { action_type: "link_click", value: String(linkClicks) },
    { action_type: "landing_page_view", value: String(landingViews) },
  ];
  const actionValues: Array<{ action_type: string; value: string }> = [];
  if (purchases > 0) {
    // Meta reports the same purchases under several overlapping action types.
    for (const type of ["offsite_conversion.fb_pixel_purchase", "purchase", "omni_purchase"]) {
      actions.push({ action_type: type, value: String(purchases) });
      actionValues.push({ action_type: type, value: purchaseValue.toFixed(2) });
    }
  }
  if (leads > 0) {
    actions.push({ action_type: "lead", value: String(leads) });
    actions.push({ action_type: "onsite_conversion.lead_grouped", value: String(leads) });
  }

  return {
    campaign_id: c.id,
    campaign_name: c.name,
    objective: c.objective,
    date_start: date,
    date_stop: date,
    spend: spend.toFixed(2),
    impressions: String(impressions),
    clicks: String(clicks),
    inline_link_clicks: String(linkClicks),
    actions,
    action_values: actionValues.length ? actionValues : undefined,
  };
}

export function createDemoSource(): InsightsSource {
  let calls = 0;
  const find = (id: string) => {
    const account = DEMO_ACCOUNTS.find((a) => a.metaAccountId === id);
    if (!account) throw new Error(`Unknown demo account ${id}`);
    return account;
  };
  const info = (a: DemoAccount): MetaAdAccountInfo => ({
    metaAccountId: a.metaAccountId,
    name: a.name,
    currency: a.currency,
    timezoneName: a.timezoneName,
    accountStatus: a.accountStatus,
  });
  return {
    get apiCalls() {
      return calls;
    },
    async listAdAccounts() {
      calls++;
      return DEMO_ACCOUNTS.map(info);
    },
    async getAdAccount(metaAccountId) {
      calls++;
      return info(find(metaAccountId));
    },
    async fetchCampaignDailyInsights(metaAccountId, range) {
      calls++;
      const account = find(metaAccountId);
      const rows: RawInsightRow[] = [];
      for (const date of eachDay(range)) {
        for (const campaign of account.campaigns) {
          const row = dayRow(metaAccountId, campaign, date);
          if (row && Number(row.impressions) > 0) rows.push(row);
        }
      }
      return rows;
    },
  };
}
