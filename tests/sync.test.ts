import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { adAccounts, insightsDaily, metaConnections, syncRuns } from "@/server/db/schema";
import { createDemoSource } from "@/server/meta/demo-source";
import { MetaApiError } from "@/server/meta/errors";
import {
  defaultSyncRange,
  observedActionTypes,
  recomputeConversions,
  splitRange,
  syncAdAccount,
} from "@/server/sync/sync-service";
import { fakeSource, insightRow, seedClient, testDb } from "./helpers";

async function totals(db: Db, accountId: string) {
  const [row] = await db
    .select({
      rows: sql<number>`count(*)::int`,
      spend: sql<number>`coalesce(sum(${insightsDaily.spend}),0)::float8`,
      conversions: sql<number>`coalesce(sum(${insightsDaily.conversions}),0)::float8`,
    })
    .from(insightsDaily)
    .where(eq(insightsDaily.adAccountId, accountId));
  return row;
}

describe("sync", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("splits long ranges into chunks covering every day exactly once", () => {
    const chunks = splitRange({ from: "2026-01-01", to: "2026-03-15" }, 31);
    expect(chunks).toEqual([
      { from: "2026-01-01", to: "2026-01-31" },
      { from: "2026-02-01", to: "2026-03-03" },
      { from: "2026-03-04", to: "2026-03-15" },
    ]);
  });

  it("backfills on first sync, then refreshes the attribution window", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(defaultSyncRange("Europe/Paris", null, now).from).toBe("2025-09-19");
    expect(defaultSyncRange("Europe/Paris", now, now)).toEqual({ from: "2026-09-21", to: "2026-10-19" });
  });

  it("is idempotent: re-running the same sync yields identical data", async () => {
    const { account } = await seedClient(db, "A", "act_100000000000001");
    const range = { from: "2026-08-01", to: "2026-09-30" };
    const factory = () => createDemoSource();

    const first = await syncAdAccount(db, account.id, { trigger: "manual", range, sourceFactory: factory });
    const afterFirst = await totals(db, account.id);
    const second = await syncAdAccount(db, account.id, { trigger: "manual", range, sourceFactory: factory });
    const afterSecond = await totals(db, account.id);

    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    expect(afterFirst.rows).toBeGreaterThan(100);
    expect(afterSecond).toEqual(afterFirst);
  });

  it("replaces the synced window so rows Meta stopped returning disappear", async () => {
    const { account } = await seedClient(db, "A", "act_1");
    const range = { from: "2026-10-01", to: "2026-10-02" };
    await syncAdAccount(db, account.id, {
      trigger: "manual",
      range,
      sourceFactory: () => fakeSource(() => [insightRow("c1", "2026-10-01", 10), insightRow("c2", "2026-10-02", 5)]),
    });
    await syncAdAccount(db, account.id, {
      trigger: "manual",
      range,
      sourceFactory: () => fakeSource(() => [insightRow("c1", "2026-10-01", 12, 2)]),
    });
    expect(await totals(db, account.id)).toEqual({ rows: 1, spend: 12, conversions: 2 });
  });

  it("records failures, keeps previous data and flags expired tokens", async () => {
    const { account, connection } = await seedClient(db, "A", "act_1", "meta");
    const range = { from: "2026-10-01", to: "2026-10-01" };
    await syncAdAccount(db, account.id, {
      trigger: "manual",
      range,
      sourceFactory: () => fakeSource(() => [insightRow("c1", "2026-10-01", 10)]),
    });

    const result = await syncAdAccount(db, account.id, {
      trigger: "cron",
      range,
      sourceFactory: () =>
        fakeSource(() => new MetaApiError({ message: "Session has expired", kind: "auth", code: 190 })),
    });

    expect(result.status).toBe("error");
    expect(result.errorMessage).toMatch(/token Meta est invalide ou a expiré/);
    expect((await totals(db, account.id)).spend).toBe(10);
    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, result.runId!));
    expect(run).toMatchObject({ status: "error", errorCode: "meta_auth_190" });
    const [conn] = await db.select().from(metaConnections).where(eq(metaConnections.id, connection.id));
    expect(conn.status).toBe("expired");
    const [acc] = await db.select().from(adAccounts).where(eq(adAccounts.id, account.id));
    expect(acc.syncLockedUntil).toBeNull();
    expect(acc.lastSyncStatus).toBe("error");
  });

  it("does not run two syncs of the same account concurrently", async () => {
    const { account } = await seedClient(db, "A", "act_1");
    await db
      .update(adAccounts)
      .set({ syncLockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(adAccounts.id, account.id));
    const result = await syncAdAccount(db, account.id, {
      trigger: "cron",
      range: { from: "2026-10-01", to: "2026-10-01" },
      sourceFactory: () => fakeSource(() => []),
    });
    expect(result.status).toBe("skipped");
  });

  it("rejects rows outside the requested window", async () => {
    const { account } = await seedClient(db, "A", "act_1");
    const result = await syncAdAccount(db, account.id, {
      trigger: "manual",
      range: { from: "2026-10-01", to: "2026-10-01" },
      sourceFactory: () => fakeSource(() => [insightRow("c1", "2026-09-01", 10)]),
    });
    expect(result.status).toBe("error");
    expect(await totals(db, account.id)).toMatchObject({ rows: 0 });
  });

  it("recomputes conversions from raw actions when the conversion setting changes", async () => {
    const { account } = await seedClient(db, "A", "act_100000000000001");
    await syncAdAccount(db, account.id, {
      trigger: "manual",
      range: { from: "2026-09-01", to: "2026-09-30" },
      sourceFactory: () => createDemoSource(),
    });
    const before = await totals(db, account.id);
    expect(before.conversions).toBeGreaterThan(0);

    await recomputeConversions(db, account.id, []);
    expect((await totals(db, account.id)).conversions).toBe(0);

    await recomputeConversions(db, account.id, ["offsite_conversion.fb_pixel_purchase", "purchase"]);
    expect((await totals(db, account.id)).conversions).toBeCloseTo(before.conversions * 2);

    const observed = await observedActionTypes(db, account.id);
    expect(observed.map((o) => o.actionType)).toContain("offsite_conversion.fb_pixel_purchase");
  });
});
