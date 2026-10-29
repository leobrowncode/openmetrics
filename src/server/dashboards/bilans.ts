import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { validateRange, type DateRange } from "@/lib/periods";
import type { Db } from "../db/client";
import { bilans, campaigns, dashboards } from "../db/schema";
import { dashboardAccountScope } from "./data";

const CAMPAIGN_ID = /^\d{1,30}$/;
const MAX_CAMPAIGNS = 200;

export type Bilan = typeof bilans.$inferSelect;

export async function listBilans(db: Db, dashboardId: string): Promise<Bilan[]> {
  return db.select().from(bilans).where(eq(bilans.dashboardId, dashboardId)).orderBy(desc(bilans.createdAt));
}

export async function getBilan(db: Db, dashboardId: string, bilanId: string): Promise<Bilan | null> {
  const [row] = await db
    .select()
    .from(bilans)
    .where(and(eq(bilans.id, bilanId), eq(bilans.dashboardId, dashboardId)));
  return row ?? null;
}

export async function createBilan(
  db: Db,
  input: { dashboardId: string; name: string; campaignIds: string[]; range: DateRange },
): Promise<{ id: string } | { error: string }> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 120) return { error: "Indiquez un nom de bilan (120 caractères maximum)." };
  const rangeError = validateRange(input.range);
  if (rangeError) return { error: rangeError };

  const ids = [...new Set(input.campaignIds.map((id) => id.trim()).filter((id) => CAMPAIGN_ID.test(id)))].slice(0, MAX_CAMPAIGNS);
  if (ids.length === 0) return { error: "Sélectionnez au moins une campagne." };

  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, input.dashboardId));
  if (!dashboard) return { error: "Dashboard introuvable." };

  const accounts = await dashboardAccountScope(db, dashboard);
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) return { error: "Aucun compte publicitaire actif pour ce client." };

  const rows = await db
    .select({ id: campaigns.metaCampaignId })
    .from(campaigns)
    .where(inArray(campaigns.adAccountId, accountIds));
  const allowed = new Set(rows.map((r) => r.id));
  if (ids.some((id) => !allowed.has(id))) return { error: "Certaines campagnes ne font pas partie de ce client." };

  const [row] = await db
    .insert(bilans)
    .values({
      dashboardId: dashboard.id,
      name,
      campaignIds: ids,
      rangeFrom: input.range.from,
      rangeTo: input.range.to,
    })
    .returning();
  return { id: row.id };
}

export async function deleteBilan(db: Db, dashboardId: string, bilanId: string): Promise<void> {
  await db.delete(bilans).where(and(eq(bilans.id, bilanId), eq(bilans.dashboardId, dashboardId)));
}
