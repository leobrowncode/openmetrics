import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { createBilan } from "@/server/dashboards/bilans";
import { loadDashboardPayload } from "@/server/dashboards/query";
import { shareLinks } from "@/server/db/schema";
import { createShareLink, renewShareLink, verifyShareToken } from "@/server/share/share-links";
import { syncAdAccount } from "@/server/sync/sync-service";
import { fakeSource, insightRow, seedClient, testDb } from "./helpers";

describe("bilans", () => {
  let db: Db;
  beforeEach(async () => {
    db = await testDb();
  });

  it("stores a frozen range for this client's campaigns and rejects another client's", async () => {
    const a = await seedClient(db, "A", "act_1");
    const b = await seedClient(db, "B", "act_2");
    const range = { from: "2026-10-01", to: "2026-10-02" };
    await syncAdAccount(db, a.account.id, {
      trigger: "manual",
      range,
      sourceFactory: () => fakeSource(() => [insightRow("11", "2026-10-01", 10, 1), insightRow("12", "2026-10-01", 5, 1)]),
    });
    await syncAdAccount(db, b.account.id, {
      trigger: "manual",
      range,
      sourceFactory: () => fakeSource(() => [insightRow("99", "2026-10-01", 999, 9)]),
    });

    const foreign = await createBilan(db, {
      dashboardId: a.dashboard.id,
      name: "Bilan étranger",
      campaignIds: ["99"],
      range,
    });
    expect(foreign).toEqual({ error: "Certaines campagnes ne font pas partie de ce client." });

    const created = await createBilan(db, {
      dashboardId: a.dashboard.id,
      name: "Bilan octobre",
      campaignIds: ["11"],
      range,
    });
    expect(created).toEqual({ id: expect.any(String) });
    if (!("id" in created)) return;

    const payload = await loadDashboardPayload(
      db,
      a.dashboard,
      new URLSearchParams("period=last_7_days&campaigns=12,99"),
      "viewer",
      { range, campaignIds: ["11"] },
    );
    expect("error" in payload).toBe(false);
    if ("error" in payload) return;
    expect(payload.query).toMatchObject({ period: "custom", range, campaignIds: ["11"] });
    expect(payload.data.totals.spend).toBe(10);
    expect(payload.data.selectedCampaignIds).toEqual(["11"]);
    expect(payload.data.conversion.naming).toEqual({ singular: "achat", plural: "Achats" });

    const link = await createShareLink(db, {
      dashboardId: a.dashboard.id,
      label: "Client",
      expiresAt: null,
      bilanId: created.id,
    });
    const [stored] = await db.select().from(shareLinks).where(eq(shareLinks.id, link.link.id));
    expect(stored.bilanId).toBe(created.id);
    expect(await verifyShareToken(db, link.token)).not.toBeNull();

    const renewed = await renewShareLink(db, a.dashboard.id, link.link.id, null);
    expect(renewed?.link.bilanId).toBe(created.id);
    expect(await verifyShareToken(db, link.token)).toBeNull();

    await expect(
      createShareLink(db, { dashboardId: b.dashboard.id, label: "Autre", expiresAt: null, bilanId: created.id }),
    ).rejects.toThrow("Bilan introuvable pour ce dashboard.");
  });
});
