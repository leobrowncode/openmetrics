import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { adAccounts, insightsDaily, metaConnections, syncRuns } from "@/server/db/schema";
import { createDemoSource } from "@/server/meta/demo-source";
import { MetaApiError } from "@/server/meta/errors";
import { getDashboardData } from "@/server/dashboards/data";
import type { DateRange } from "@/lib/periods";
import {
  observedActionTypes,
  planSync,
  recomputeConversions,
  splitRange,
  syncAdAccount,
  syncAllAccounts,
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
    const first = planSync({ timezoneName: "Europe/Paris", lastSyncedAt: null, historyFrom: null }, now);
    expect(first.refresh).toEqual([{ from: "2026-09-21", to: "2026-10-19" }]);
    expect(first.backfill[0].to).toBe("2026-09-20");
    expect(first.backfill.at(-1)!.from).toBe("2024-09-19");
    expect(first.backfill.every((c, i) => i === 0 || c.to < first.backfill[i - 1].from)).toBe(true);

    const daily = planSync({ timezoneName: "Europe/Paris", lastSyncedAt: now, historyFrom: "2024-09-19" }, now);
    expect(daily.refresh).toEqual([{ from: "2026-09-21", to: "2026-10-19" }]);
    expect(daily.backfill).toEqual([]);
  });

  it("refreshes from the last successful sync after an outage, leaving no stale gap", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    const plan = planSync(
      { timezoneName: "Europe/Paris", lastSyncedAt: new Date("2026-09-01T03:00:00Z"), historyFrom: "2024-09-19" },
      now,
    );
    expect(plan.refreshFrom).toBe("2026-08-04");
    expect(plan.refresh.at(-1)!.from).toBe("2026-08-04");
    expect(plan.refresh[0].to).toBe("2026-10-19");
  });

  it("stops at the time budget and resumes the backfill where it stopped", async () => {
    const { account, dashboard } = await seedClient(db, "A", "act_1");
    const now = new Date("2026-10-19T12:00:00Z");
    let t = 0;
    const fetched: DateRange[] = [];
    const source = () =>
      fakeSource((range) => {
        t += 400;
        fetched.push(range);
        return [insightRow("c1", range.to, 1)];
      });

    const first = await syncAdAccount(db, account.id, { trigger: "backfill", now, sourceFactory: source, deadline: 1000, clock: () => t });
    expect(first.status).toBe("partial");
    expect(fetched).toHaveLength(3);
    let [acc] = await db.select().from(adAccounts).where(eq(adAccounts.id, account.id));
    expect(acc.lastSyncedAt).not.toBeNull();
    expect(acc.historyFrom).toBe(fetched[2].from);
    expect(acc.lastSyncStatus).toBe("partial");
    expect(acc.syncLockedUntil).toBeNull();

    const recent = await getDashboardData(db, dashboard, { range: { from: "2026-10-01", to: "2026-10-18" }, compare: true });
    expect(recent.warnings.filter((w) => w.includes("Données disponibles"))).toEqual([]);
    const yearly = await getDashboardData(db, dashboard, { range: { from: "2026-01-01", to: "2026-10-18" }, compare: true });
    expect(yearly.warnings.some((w) => w.includes(`Données disponibles à partir du`) && w.includes("comparaison"))).toBe(true);

    const firstBackfill = fetched.slice(1).map((r) => r.from);
    fetched.length = 0;
    const second = await syncAdAccount(db, account.id, { trigger: "cron", now, sourceFactory: source, deadline: Infinity, clock: () => t });
    expect(second.status).toBe("success");
    expect(fetched[0]).toEqual({ from: "2026-09-21", to: "2026-10-19" });
    expect(fetched.slice(1).some((r) => firstBackfill.includes(r.from))).toBe(false);
    [acc] = await db.select().from(adAccounts).where(eq(adAccounts.id, account.id));
    expect(acc.historyFrom).toBe("2024-09-19");
    expect((await totals(db, account.id)).rows).toBe(3 + fetched.length - 1);

    const yearlyAfter = await getDashboardData(db, dashboard, { range: { from: "2026-01-01", to: "2026-10-18" }, compare: true });
    expect(yearlyAfter.warnings.filter((w) => w.includes("Données disponibles"))).toEqual([]);
  });

  it("keeps cron runs within the shared time budget", async () => {
    await seedClient(db, "A", "act_1");
    await seedClient(db, "B", "act_2");
    const results = await syncAllAccounts(db, { budgetMs: 0, sourceFactory: () => fakeSource(() => []) });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("closes runs killed by the platform time limit", async () => {
    const { account } = await seedClient(db, "A", "act_1");
    const [stale] = await db
      .insert(syncRuns)
      .values({ adAccountId: account.id, trigger: "cron", status: "running", rangeFrom: "2026-10-01", rangeTo: "2026-10-19" })
      .returning();
    await syncAdAccount(db, account.id, {
      trigger: "manual",
      range: { from: "2026-10-01", to: "2026-10-01" },
      sourceFactory: () => fakeSource(() => []),
    });
    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, stale.id));
    expect(run).toMatchObject({ status: "error", errorCode: "interrupted" });
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
