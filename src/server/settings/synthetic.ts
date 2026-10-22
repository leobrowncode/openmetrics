import "server-only";
import { and, eq } from "drizzle-orm";
import type { SyntheticDisplay } from "@/lib/synthetic-display";
import type { Db } from "../db/client";
import { adAccounts, metaConnections, siteSettings } from "../db/schema";

const SETTINGS_ID = "default";

export async function getSyntheticDisplay(db: Db): Promise<SyntheticDisplay> {
  const [row] = await db
    .select({ syntheticDisplay: siteSettings.syntheticDisplay })
    .from(siteSettings)
    .where(eq(siteSettings.id, SETTINGS_ID));
  return row?.syntheticDisplay ?? "auto";
}

export async function setSyntheticDisplay(db: Db, display: SyntheticDisplay): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ id: SETTINGS_ID, syntheticDisplay: display })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: { syntheticDisplay: display, updatedAt: new Date() },
    });
}

/** True when at least one active ad account comes from a real Meta connection. */
export async function hasRealMetaAccount(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ id: adAccounts.id })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(and(eq(adAccounts.isActive, true), eq(metaConnections.kind, "meta")))
    .limit(1);
  return Boolean(row);
}
