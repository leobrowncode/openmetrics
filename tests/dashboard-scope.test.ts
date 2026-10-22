import { describe, expect, it } from "vitest";
import { dashboardAccountScope } from "@/server/dashboards/data";
import { adAccounts, metaConnections } from "@/server/db/schema";
import { setSyntheticDisplay } from "@/server/settings/synthetic";
import { seedClient, testDb } from "./helpers";

describe("dashboard account scope", () => {
  it("drops synthetic accounts for a client that has a real Meta account", async () => {
    const db = await testDb();
    const demo = await seedClient(db, "Horizon", "act_1", "demo");
    const [connection] = await db.insert(metaConnections).values({ label: "Meta", kind: "meta" }).returning();
    await db.insert(adAccounts).values({
      clientId: demo.client.id,
      connectionId: connection.id,
      metaAccountId: "act_9",
      name: "Compte réel",
      currency: "EUR",
      timezoneName: "Europe/Paris",
      conversionActionTypes: ["offsite_conversion.fb_pixel_purchase"],
    });

    const accounts = await dashboardAccountScope(db, demo.dashboard);
    expect(accounts.map((account) => account.metaAccountId)).toEqual(["act_9"]);
  });

  it("hides a synthetic-only dashboard when the switch is off", async () => {
    const db = await testDb();
    const demo = await seedClient(db, "Horizon", "act_1", "demo");
    await setSyntheticDisplay(db, "hide");
    const accounts = await dashboardAccountScope(db, demo.dashboard);
    expect(accounts).toEqual([]);
  });
});
