import { describe, expect, it } from "vitest";
import { REFERENCE_TEMPLATE_CONFIG } from "@/lib/dashboard-config";
import {
  accountCountsByClient,
  accountCountsByConnection,
  activeLinkCountsByDashboard,
  dashboardCountsByClient,
} from "@/server/admin/counts";
import { dashboards } from "@/server/db/schema";
import { createShareLink, revokeShareLink } from "@/server/share/share-links";
import { seedClient, testDb } from "./helpers";

describe("admin listing counts", () => {
  it("counts per owner, not per row id", async () => {
    const db = await testDb();
    const a = await seedClient(db, "Horizon", "act_1");
    const b = await seedClient(db, "Lumen", "act_2");
    await db.insert(dashboards).values({ clientId: a.client.id, name: "Second", config: REFERENCE_TEMPLATE_CONFIG });

    const byConnection = await accountCountsByConnection(db);
    expect(byConnection.get(a.connection.id)).toBe(1);
    expect(byConnection.get(b.connection.id)).toBe(1);

    expect((await accountCountsByClient(db)).get(a.client.id)).toBe(1);
    const dashboardCounts = await dashboardCountsByClient(db);
    expect(dashboardCounts.get(a.client.id)).toBe(2);
    expect(dashboardCounts.get(b.client.id)).toBe(1);
  });

  it("counts only active share links", async () => {
    const db = await testDb();
    const { dashboard } = await seedClient(db, "Horizon", "act_1");
    const now = new Date("2026-10-20T10:00:00Z");
    await createShareLink(db, { dashboardId: dashboard.id, label: "Actif", expiresAt: null });
    await createShareLink(db, { dashboardId: dashboard.id, label: "Expiré", expiresAt: new Date("2026-10-01T00:00:00Z") });
    const revoked = await createShareLink(db, { dashboardId: dashboard.id, label: "Révoqué", expiresAt: null });
    await revokeShareLink(db, dashboard.id, revoked.link.id, now);

    expect((await activeLinkCountsByDashboard(db, now)).get(dashboard.id)).toBe(1);
  });
});
