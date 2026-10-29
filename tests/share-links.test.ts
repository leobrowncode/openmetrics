import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { shareLinks } from "@/server/db/schema";
import { getDashboardData } from "@/server/dashboards/data";
import {
  createShareLink,
  renewShareLink,
  revokeShareLink,
  updateShareLinkExpiry,
  verifyShareToken,
} from "@/server/share/share-links";
import { syncAdAccount } from "@/server/sync/sync-service";
import { fakeSource, insightRow, seedClient, testDb } from "./helpers";

describe("share links", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("returns a high-entropy token once and stores only its fingerprint", async () => {
    const { dashboard } = await seedClient(db, "A", "act_1");
    const { link, token } = await createShareLink(db, { dashboardId: dashboard.id, label: "Client", expiresAt: null });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [stored] = await db.select().from(shareLinks).where(eq(shareLinks.id, link.id));
    expect(stored.tokenHash).not.toContain(token);
    expect(JSON.stringify(stored)).not.toContain(token);
    const other = await createShareLink(db, { dashboardId: dashboard.id, label: "Client", expiresAt: null });
    expect(other.token).not.toBe(token);
  });

  it("verifies valid tokens and rejects malformed, unknown or mismatched ones", async () => {
    const { dashboard } = await seedClient(db, "A", "act_1");
    const { link, token } = await createShareLink(db, { dashboardId: dashboard.id, label: "x", expiresAt: null });
    expect((await verifyShareToken(db, token))?.dashboard.id).toBe(dashboard.id);
    expect(await verifyShareToken(db, token, { expectedLinkId: link.id })).not.toBeNull();
    expect(await verifyShareToken(db, token, { expectedLinkId: "other" })).toBeNull();
    expect(await verifyShareToken(db, "short")).toBeNull();
    expect(await verifyShareToken(db, undefined)).toBeNull();
    expect(await verifyShareToken(db, "A".repeat(43))).toBeNull();
  });

  it("loses access immediately once revoked", async () => {
    const { dashboard } = await seedClient(db, "A", "act_1");
    const { link, token } = await createShareLink(db, { dashboardId: dashboard.id, label: "x", expiresAt: null });
    await revokeShareLink(db, dashboard.id, link.id);
    expect(await verifyShareToken(db, token)).toBeNull();
  });

  it("loses access at expiry", async () => {
    const { dashboard } = await seedClient(db, "A", "act_1");
    const expiresAt = new Date("2026-11-01T00:00:00Z");
    const { link, token } = await createShareLink(db, { dashboardId: dashboard.id, label: "x", expiresAt });
    expect(await verifyShareToken(db, token, { now: new Date("2026-10-31T23:59:59Z") })).not.toBeNull();
    expect(await verifyShareToken(db, token, { now: new Date("2026-11-01T00:00:00Z") })).toBeNull();
    await updateShareLinkExpiry(db, dashboard.id, link.id, new Date(Date.now() - 1000));
    expect(await verifyShareToken(db, token)).toBeNull();
  });

  it("renewal revokes the old token and issues a new one", async () => {
    const { dashboard } = await seedClient(db, "A", "act_1");
    const { link, token } = await createShareLink(db, { dashboardId: dashboard.id, label: "x", expiresAt: null });
    const renewed = await renewShareLink(db, dashboard.id, link.id, null);
    expect(renewed).not.toBeNull();
    expect(await verifyShareToken(db, token)).toBeNull();
    expect(await verifyShareToken(db, renewed!.token)).not.toBeNull();
  });

  it("cannot revoke a link through another dashboard", async () => {
    const a = await seedClient(db, "A", "act_1");
    const b = await seedClient(db, "B", "act_2");
    const { link, token } = await createShareLink(db, { dashboardId: a.dashboard.id, label: "x", expiresAt: null });
    await revokeShareLink(db, b.dashboard.id, link.id);
    expect(await verifyShareToken(db, token)).not.toBeNull();
  });
});

describe("client data isolation", () => {
  it("a dashboard only reads its own client's accounts, even with foreign campaign ids", async () => {
    const db = await testDb();
    const a = await seedClient(db, "A", "act_1");
    const b = await seedClient(db, "B", "act_2");
    const range = { from: "2026-10-01", to: "2026-10-02" };
    await syncAdAccount(db, a.account.id, {
      trigger: "manual",
      range,
      sourceFactory: () => fakeSource(() => [insightRow("a1", "2026-10-01", 10, 1)]),
    });
    await syncAdAccount(db, b.account.id, {
      trigger: "manual",
      range,
      sourceFactory: () => fakeSource(() => [insightRow("b1", "2026-10-01", 999, 9)]),
    });

    const dataA = await getDashboardData(db, a.dashboard, { range, compare: false });
    expect(dataA.totals.spend).toBe(10);
    expect(dataA.campaigns.map((c) => c.id)).toEqual(["a1"]);

    const forged = await getDashboardData(db, a.dashboard, { range, campaignIds: ["b1"], compare: false });
    expect(forged.totals.spend).toBe(0);
    expect(forged.series).toEqual([]);
    expect(forged.byCampaign).toEqual([]);
    expect(forged.dataFrom).toBeNull();

    // A dashboard pointing at another client's account id must not read it either.
    const crafted = { ...a.dashboard, adAccountIds: [b.account.id] };
    const dataCrafted = await getDashboardData(db, crafted, { range, compare: false });
    expect(dataCrafted.totals.spend).toBe(0);
  });

  it("computes totals, previous period and per-campaign rows consistently", async () => {
    const db = await testDb();
    const a = await seedClient(db, "A", "act_1");
    await syncAdAccount(db, a.account.id, {
      trigger: "manual",
      range: { from: "2026-09-29", to: "2026-10-02" },
      sourceFactory: () =>
        fakeSource(() => [
          insightRow("c1", "2026-09-29", 4),
          insightRow("c1", "2026-10-01", 10, 1),
          insightRow("c2", "2026-10-01", 5),
          insightRow("c2", "2026-10-02", 5, 2),
        ]),
    });
    const data = await getDashboardData(db, a.dashboard, { range: { from: "2026-10-01", to: "2026-10-02" }, compare: true });
    expect(data.totals).toMatchObject({ spend: 20, conversions: 3, conversionValue: 150 });
    expect(data.previousRange).toEqual({ from: "2026-09-29", to: "2026-09-30" });
    expect(data.previousTotals?.spend).toBe(4);
    expect(data.dataFrom).toBe("2026-09-29");
    expect(data.series.map((s) => s.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(data.byCampaign.reduce((acc, c) => acc + c.spend, 0)).toBe(20);

    const filtered = await getDashboardData(db, a.dashboard, {
      range: { from: "2026-10-01", to: "2026-10-02" },
      campaignIds: ["c2"],
      compare: false,
    });
    expect(filtered.totals.spend).toBe(10);
    expect(filtered.selectedCampaignIds).toEqual(["c2"]);
    expect(filtered.dataFrom).toBe("2026-10-01");
  });
});
