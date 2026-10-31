import "server-only";
import { eq } from "drizzle-orm";
import { syntheticAccountsVisible, type SyntheticDisplay } from "@/lib/synthetic-display";
import type { Db } from "../db/client";
import { adAccounts, metaConnections } from "../db/schema";
import { getSyntheticDisplay, hasRealMetaAccount } from "./synthetic";

export interface SyntheticScope {
  display: SyntheticDisplay;
  instanceHasRealAccount: boolean;
  /** Synthetic clients, dashboards, accounts and syncs are omitted from the product. */
  hidden: boolean;
  /** Clients whose every ad account comes from a demo connection. */
  syntheticClientIds: string[];
  demoAccountIds: string[];
  demoConnectionIds: string[];
}

/**
 * Visibility of the synthetic package. Numbers on a dashboard are filtered
 * separately by `includeAccountInDashboard`; this scope removes the clients,
 * dashboards, accounts and connections themselves.
 */
export async function loadSyntheticScope(db: Db): Promise<SyntheticScope> {
  const display = await getSyntheticDisplay(db);
  const instanceHasRealAccount = await hasRealMetaAccount(db);
  const hidden = !syntheticAccountsVisible({ display, instanceHasRealAccount });
  if (!hidden) {
    return {
      display,
      instanceHasRealAccount,
      hidden: false,
      syntheticClientIds: [],
      demoAccountIds: [],
      demoConnectionIds: [],
    };
  }

  const [accounts, demoConnections] = await Promise.all([
    db
      .select({ id: adAccounts.id, clientId: adAccounts.clientId, kind: metaConnections.kind })
      .from(adAccounts)
      .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId)),
    db.select({ id: metaConnections.id }).from(metaConnections).where(eq(metaConnections.kind, "demo")),
  ]);

  const byClient = new Map<string, { demo: boolean; meta: boolean }>();
  const demoAccountIds: string[] = [];
  for (const row of accounts) {
    const current = byClient.get(row.clientId) ?? { demo: false, meta: false };
    if (row.kind === "demo") {
      current.demo = true;
      demoAccountIds.push(row.id);
    } else {
      current.meta = true;
    }
    byClient.set(row.clientId, current);
  }

  return {
    display,
    instanceHasRealAccount,
    hidden: true,
    syntheticClientIds: [...byClient.entries()].filter(([, flags]) => flags.demo && !flags.meta).map(([id]) => id),
    demoAccountIds,
    demoConnectionIds: demoConnections.map((connection) => connection.id),
  };
}

export async function syntheticClientHidden(db: Db, clientId: string): Promise<boolean> {
  const scope = await loadSyntheticScope(db);
  return scope.syntheticClientIds.includes(clientId);
}
