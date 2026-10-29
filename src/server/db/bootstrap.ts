import "server-only";
import { eq, sql } from "drizzle-orm";
import { REFERENCE_TEMPLATE_CONFIG } from "@/lib/dashboard-config";
import { createAdminUser, syncEnvAdmin } from "../auth/admin";
import { addDays, todayInTimezone } from "@/lib/periods";
import { env } from "../env";
import { DEMO_ACCOUNTS } from "../meta/demo-source";
import { INITIAL_BACKFILL_DAYS, syncAdAccount } from "../sync/sync-service";
import type { Db } from "./client";
import { adAccounts, adminUsers, clients, dashboards, dashboardTemplates, metaConnections } from "./schema";

export const DEMO_ADMIN_EMAIL = "admin@demo.local";
export const DEMO_ADMIN_PASSWORD = "demo-password-2026";

export async function ensureBootstrap(db: Db, options: { demo: boolean }): Promise<void> {
  const [{ count: templateCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dashboardTemplates)
    .where(eq(dashboardTemplates.builtIn, true));
  if (templateCount === 0) {
    await db.insert(dashboardTemplates).values({
      name: "Référence agence - 4 sections",
      description: "Investissements · Impressions et clics · CTR et CPC · Conversions (modèle Looker Studio de l'agence).",
      config: REFERENCE_TEMPLATE_CONFIG,
      builtIn: true,
    });
  }

  const [{ count: adminCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(adminUsers);
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();
  // While these variables stay set, they are the password for that email.
  // Changing ADMIN_PASSWORD (or fixing a trailing newline) takes effect on the
  // next request. Remove them after the first login so a password chosen in
  // the Team page is not overwritten.
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const synced = await syncEnvAdmin(db, ADMIN_EMAIL, ADMIN_PASSWORD);
    if (synced !== "unchanged") {
      const database = env().DATABASE_URL ? "postgres" : "embedded";
      console.info(`Bootstrap admin ${synced} for ${ADMIN_EMAIL.trim().toLowerCase()} via ${database}`);
    }
  }
  // Demo credentials stay available on a DEMO_MODE instance, including production,
  // so the synthetic dashboard can be opened without a client-supplied login.
  if (adminCount === 0 && options.demo) {
    await createAdminUser(db, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
  }

  if (options.demo) await seedDemo(db);
}

/** Synthetic clients and accounts, synced through the regular pipeline. */
export async function seedDemo(db: Db): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(clients);
  if (count > 0) return;

  // Fixed ids so every serverless instance seeds the same public URLs.
  const demoIds = {
    connection: "10000000-0000-4000-8000-000000000001",
    clients: ["10000000-0000-4000-8000-000000000011", "10000000-0000-4000-8000-000000000012"],
    accounts: ["10000000-0000-4000-8000-000000000021", "10000000-0000-4000-8000-000000000022"],
    dashboards: ["10000000-0000-4000-8000-000000000031", "10000000-0000-4000-8000-000000000032"],
  };
  const [connection] = await db
    .insert(metaConnections)
    .values({ id: demoIds.connection, label: "Données synthétiques (démo)", kind: "demo", grantedScopes: ["ads_read"] })
    .returning();
  const [template] = await db.select().from(dashboardTemplates).where(eq(dashboardTemplates.builtIn, true));

  const clientNames = ["Association Horizon", "Maison Lumen"];
  for (const [index, account] of DEMO_ACCOUNTS.entries()) {
    const [client] = await db.insert(clients).values({ id: demoIds.clients[index], name: clientNames[index] }).returning();
    const [adAccount] = await db
      .insert(adAccounts)
      .values({
        id: demoIds.accounts[index],
        clientId: client.id,
        connectionId: connection.id,
        metaAccountId: account.metaAccountId,
        name: account.name,
        currency: account.currency,
        timezoneName: account.timezoneName,
        conversionActionTypes: ["offsite_conversion.fb_pixel_purchase"],
      })
      .returning();
    // A full 25-month import does not fit in one serverless invocation. Seed the
    // window the default dashboard needs, then mark history complete so the
    // daily cron does not spend its budget backfilling synthetic days.
    const today = todayInTimezone(account.timezoneName);
    const from = addDays(today, -120);
    await syncAdAccount(db, adAccount.id, { trigger: "backfill", range: { from, to: today } });
    await db
      .update(adAccounts)
      .set({ historyFrom: addDays(today, -INITIAL_BACKFILL_DAYS) })
      .where(eq(adAccounts.id, adAccount.id));
    await db.insert(dashboards).values({
      id: demoIds.dashboards[index],
      clientId: client.id,
      name: `${client.name} - Reporting Meta Ads`,
      config: template.config,
    });
  }
}
