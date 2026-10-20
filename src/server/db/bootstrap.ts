import "server-only";
import { eq, sql } from "drizzle-orm";
import { REFERENCE_TEMPLATE_CONFIG } from "@/lib/dashboard-config";
import { createAdminUser } from "../auth/admin";
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
      name: "Référence agence — 4 sections",
      description: "Investissements · Impressions et clics · CTR et CPC · Conversions (modèle Looker Studio de l'agence).",
      config: REFERENCE_TEMPLATE_CONFIG,
      builtIn: true,
    });
  }

  const [{ count: adminCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(adminUsers);
  if (adminCount === 0) {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = env();
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      await createAdminUser(db, ADMIN_EMAIL, ADMIN_PASSWORD);
    }
    // Demo credentials stay available on a DEMO_MODE instance, including production,
    // so the synthetic dashboard can be opened without a client-supplied login.
    if (options.demo) {
      await createAdminUser(db, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    }
  }

  if (options.demo) await seedDemo(db);
}

/** Synthetic clients and accounts, synced through the regular pipeline. */
export async function seedDemo(db: Db): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(clients);
  if (count > 0) return;

  const [connection] = await db
    .insert(metaConnections)
    .values({ label: "Données synthétiques (démo)", kind: "demo", grantedScopes: ["ads_read"] })
    .returning();
  const [template] = await db.select().from(dashboardTemplates).where(eq(dashboardTemplates.builtIn, true));

  const clientNames = ["Association Horizon", "Maison Lumen"];
  for (const [index, account] of DEMO_ACCOUNTS.entries()) {
    const [client] = await db.insert(clients).values({ name: clientNames[index] }).returning();
    const [adAccount] = await db
      .insert(adAccounts)
      .values({
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
      clientId: client.id,
      name: `${client.name} — Reporting Meta Ads`,
      config: template.config,
    });
  }
}
