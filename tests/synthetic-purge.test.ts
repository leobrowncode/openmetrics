import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { adAccounts, bilans, clients, dashboards, insightsDaily, metaConnections, syncRuns } from "@/server/db/schema";
import { listAvailableAdAccounts } from "@/server/meta/available-accounts";
import { createShareLink, verifyShareToken } from "@/server/share/share-links";
import { loadSyntheticScope } from "@/server/settings/synthetic-scope";
import { purgeSyntheticDataIfReady } from "@/server/settings/synthetic-purge";
import { setSyntheticDisplay } from "@/server/settings/synthetic";
import { syncAdAccount, syncAllAccounts } from "@/server/sync/sync-service";
import { fakeSource, insightRow, seedClient, testDb } from "./helpers";

async function landedSync(db: Awaited<ReturnType<typeof testDb>>, accountId: string, status: "success" | "partial" | "error", rowsWritten: number) {
  await db.insert(syncRuns).values({
    adAccountId: accountId,
    trigger: "manual",
    status,
    rangeFrom: "2026-10-01",
    rangeTo: "2026-10-01",
    rowsWritten,
    finishedAt: new Date(),
  });
}

describe("synthetic package", () => {
  it("hides synthetic clients, dashboards and share links without deleting them", async () => {
    const db = await testDb();
    const demo = await seedClient(db, "Horizon", "act_demo", "demo");
    const { token } = await createShareLink(db, { dashboardId: demo.dashboard.id, label: "Client", expiresAt: null });

    await setSyntheticDisplay(db, "hide");
    const scope = await loadSyntheticScope(db);
    expect(scope.hidden).toBe(true);
    expect(scope.syntheticClientIds).toEqual([demo.client.id]);
    expect(await verifyShareToken(db, token)).toBeNull();
    expect(await purgeSyntheticDataIfReady(db)).toBeNull();
    expect(await db.select().from(clients)).toHaveLength(1);
  });

  it("hides demo accounts from the client picker while the package is hidden", async () => {
    const db = await testDb();
    await seedClient(db, "Horizon", "act_demo", "demo");
    const before = await listAvailableAdAccounts(db);
    expect(before.accounts.length).toBeGreaterThan(0);
    expect(before.connectionCount).toBe(1);

    await setSyntheticDisplay(db, "hide");
    const after = await listAvailableAdAccounts(db);
    expect(after.accounts).toEqual([]);
    expect(after.connectionCount).toBe(0);
  });

  it("skips a synthetic sync while the package is hidden", async () => {
    const db = await testDb();
    const demo = await seedClient(db, "Horizon", "act_demo", "demo");
    await setSyntheticDisplay(db, "hide");
    const result = await syncAdAccount(db, demo.account.id, {
      trigger: "manual",
      range: { from: "2026-10-01", to: "2026-10-01" },
      sourceFactory: () => {
        throw new Error("synthetic source should not run");
      },
    });
    expect(result).toMatchObject({ status: "skipped", rowsWritten: 0, errorMessage: "Les données synthétiques sont masquées." });
    expect(await db.select().from(insightsDaily)).toHaveLength(0);
  });

  it("does not sync hidden demo accounts from the cron, then deletes them after the real sync", async () => {
    const db = await testDb();
    const demo = await seedClient(db, "Horizon", "act_demo", "demo");
    const real = await seedClient(db, "Réel", "act_real", "meta");
    await db.update(adAccounts).set({ historyFrom: "2020-01-01" }).where(eq(adAccounts.id, real.account.id));
    await setSyntheticDisplay(db, "hide");
    const results = await syncAllAccounts(db, {
      budgetMs: 60_000,
      trigger: "cron",
      sourceFactory: () => fakeSource((range) => [insightRow("c1", range.from, 10)]),
    });
    expect(results.map((result) => result.accountId)).toEqual([real.account.id]);
    expect(results[0]?.status).toBe("success");
    expect(await db.select().from(clients).where(eq(clients.id, demo.client.id))).toHaveLength(0);
    expect((await db.select().from(insightsDaily).where(eq(insightsDaily.adAccountId, real.account.id))).length).toBeGreaterThan(0);
    expect(await db.select().from(metaConnections).where(eq(metaConnections.kind, "demo"))).toHaveLength(0);
  });

  it("deletes synthetic-only clients after a real Meta sync has stored rows", async () => {
    const db = await testDb();
    const demo = await seedClient(db, "Horizon", "act_demo", "demo");
    await db.insert(bilans).values({
      dashboardId: demo.dashboard.id,
      name: "Bilan démo",
      campaignIds: ["120200000000000101"],
      rangeFrom: "2026-10-01",
      rangeTo: "2026-10-07",
    });
    const { token } = await createShareLink(db, { dashboardId: demo.dashboard.id, label: "Démo", expiresAt: null });
    const real = await seedClient(db, "Réel", "act_real", "meta");
    await db.insert(bilans).values({
      dashboardId: real.dashboard.id,
      name: "Bilan réel",
      campaignIds: ["c1"],
      rangeFrom: "2026-10-01",
      rangeTo: "2026-10-01",
    });
    await syncAdAccount(db, real.account.id, {
      trigger: "manual",
      range: { from: "2026-10-01", to: "2026-10-01" },
      sourceFactory: () => fakeSource(() => [insightRow("c1", "2026-10-01", 10)]),
    });

    expect(await db.select().from(clients).where(eq(clients.id, demo.client.id))).toHaveLength(0);
    expect(await db.select().from(dashboards).where(eq(dashboards.id, demo.dashboard.id))).toHaveLength(0);
    expect(await db.select().from(bilans).where(eq(bilans.dashboardId, demo.dashboard.id))).toHaveLength(0);
    expect(await verifyShareToken(db, token)).toBeNull();
    expect(await db.select().from(metaConnections).where(eq(metaConnections.kind, "demo"))).toHaveLength(0);
    const kept = await db.select().from(clients).where(eq(clients.id, real.client.id));
    expect(kept.map((client) => client.name)).toEqual(["Réel"]);
    expect(await db.select().from(insightsDaily).where(eq(insightsDaily.adAccountId, real.account.id))).toHaveLength(1);
    const keptBilans = await db.select().from(bilans);
    expect(keptBilans.map((bilan) => bilan.name)).toEqual(["Bilan réel"]);
  });

  it("keeps synthetic data when display is show, or when no real sync has landed", async () => {
    const db = await testDb();
    const demo = await seedClient(db, "Horizon", "act_demo", "demo");
    const real = await seedClient(db, "Réel", "act_real", "meta");
    await setSyntheticDisplay(db, "show");
    await landedSync(db, real.account.id, "success", 4);
    expect(await purgeSyntheticDataIfReady(db)).toBeNull();
    expect(await db.select().from(clients)).toHaveLength(2);

    await setSyntheticDisplay(db, "hide");
    await db.delete(syncRuns);
    expect(await purgeSyntheticDataIfReady(db)).toBeNull();
    expect(await db.select().from(clients).where(eq(clients.id, demo.client.id))).toHaveLength(1);

    await landedSync(db, real.account.id, "error", 0);
    expect(await purgeSyntheticDataIfReady(db)).toBeNull();
    await landedSync(db, real.account.id, "partial", 2);
    const purged = await purgeSyntheticDataIfReady(db);
    expect(purged?.clients).toBe(1);
    expect(await db.select().from(clients).where(eq(clients.id, demo.client.id))).toHaveLength(0);
    expect(await db.select().from(clients).where(eq(clients.id, real.client.id))).toHaveLength(1);
  });

  it("drops only the demo account when the client also has a real one", async () => {
    const db = await testDb();
    const demo = await seedClient(db, "Horizon", "act_demo", "demo");
    const [connection] = await db.insert(metaConnections).values({ label: "Meta", kind: "meta" }).returning();
    const [realAccount] = await db
      .insert(adAccounts)
      .values({
        clientId: demo.client.id,
        connectionId: connection.id,
        metaAccountId: "act_real",
        name: "Compte réel",
        currency: "EUR",
        timezoneName: "Europe/Paris",
        conversionActionTypes: ["offsite_conversion.fb_pixel_purchase"],
      })
      .returning();
    await db.update(dashboards).set({ adAccountIds: [demo.account.id, realAccount.id] }).where(eq(dashboards.id, demo.dashboard.id));
    await db.insert(bilans).values({
      dashboardId: demo.dashboard.id,
      name: "Bilan mixte",
      campaignIds: ["c1"],
      rangeFrom: "2026-10-01",
      rangeTo: "2026-10-01",
    });
    await setSyntheticDisplay(db, "hide");
    await landedSync(db, realAccount.id, "success", 1);

    const purged = await purgeSyntheticDataIfReady(db);
    expect(purged).toMatchObject({ clients: 0, accounts: 1, connections: 1 });
    const accounts = await db.select().from(adAccounts).where(eq(adAccounts.clientId, demo.client.id));
    expect(accounts.map((account) => account.metaAccountId)).toEqual(["act_real"]);
    const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, demo.dashboard.id));
    expect(dashboard?.adAccountIds).toEqual([realAccount.id]);
    expect(await db.select().from(clients)).toHaveLength(1);
    expect((await db.select().from(bilans)).map((bilan) => bilan.name)).toEqual(["Bilan mixte"]);
  });
});
