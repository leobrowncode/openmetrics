import "server-only";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import { audit } from "../auth/admin";
import type { Db } from "../db/client";
import { adAccounts, clients, dashboards, metaConnections, syncRuns } from "../db/schema";
import { loadSyntheticScope } from "./synthetic-scope";

export interface SyntheticPurgeResult {
  clients: number;
  accounts: number;
  connections: number;
}

/**
 * A real Meta account has finished a sync that stored rows, or completed
 * cleanly. The first history import usually stays `partial` until the full
 * backfill fits in one run, so a partial run that already wrote rows counts.
 */
export async function realMetaSyncHasLanded(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .innerJoin(adAccounts, eq(adAccounts.id, syncRuns.adAccountId))
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
    .where(
      and(
        eq(metaConnections.kind, "meta"),
        or(eq(syncRuns.status, "success"), and(eq(syncRuns.status, "partial"), gt(syncRuns.rowsWritten, 0))),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Deletes demo connections and the clients that only exist for them.
 * A client that also has a real Meta account keeps its client, dashboards and
 * real accounts; only the demo accounts (and their rows) are removed.
 * Irreversible: the demo seed does not run again once any client exists.
 */
export async function purgeSyntheticData(db: Db): Promise<SyntheticPurgeResult> {
  const result = await db.transaction(async (tx) => {
    const demoConnections = await tx.select({ id: metaConnections.id }).from(metaConnections).where(eq(metaConnections.kind, "demo"));
    const demoConnectionIds = demoConnections.map((connection) => connection.id);
    if (demoConnectionIds.length === 0) return { clients: 0, accounts: 0, connections: 0 };

    const demoAccounts = await tx
      .select({ id: adAccounts.id, clientId: adAccounts.clientId })
      .from(adAccounts)
      .where(inArray(adAccounts.connectionId, demoConnectionIds));
    const demoAccountIds = new Set(demoAccounts.map((account) => account.id));
    const clientIds = [...new Set(demoAccounts.map((account) => account.clientId))];

    const metaClientRows = clientIds.length
      ? await tx
          .select({ clientId: adAccounts.clientId })
          .from(adAccounts)
          .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
          .where(and(inArray(adAccounts.clientId, clientIds), eq(metaConnections.kind, "meta")))
      : [];
    const mixedClientIds = [...new Set(metaClientRows.map((row) => row.clientId))];
    const mixed = new Set(mixedClientIds);
    const syntheticClientIds = clientIds.filter((id) => !mixed.has(id));

    if (mixedClientIds.length && demoAccountIds.size > 0) {
      const boards = await tx
        .select({ id: dashboards.id, adAccountIds: dashboards.adAccountIds })
        .from(dashboards)
        .where(inArray(dashboards.clientId, mixedClientIds));
      for (const board of boards) {
        const next = board.adAccountIds.filter((id) => !demoAccountIds.has(id));
        if (next.length !== board.adAccountIds.length) {
          await tx.update(dashboards).set({ adAccountIds: next, updatedAt: new Date() }).where(eq(dashboards.id, board.id));
        }
      }
      const mixedDemoIds = demoAccounts.filter((account) => mixed.has(account.clientId)).map((account) => account.id);
      if (mixedDemoIds.length) await tx.delete(adAccounts).where(inArray(adAccounts.id, mixedDemoIds));
    }

    if (syntheticClientIds.length) await tx.delete(clients).where(inArray(clients.id, syntheticClientIds));
    await tx.delete(metaConnections).where(inArray(metaConnections.id, demoConnectionIds));
    return { clients: syntheticClientIds.length, accounts: demoAccounts.length, connections: demoConnectionIds.length };
  });

  if (result.connections > 0) {
    await audit(db, "system", "synthetic.purge", "site_settings", "default", result);
  }
  return result;
}

/** Purges only while synthetic data is hidden and a real Meta sync has landed. */
export async function purgeSyntheticDataIfReady(db: Db): Promise<SyntheticPurgeResult | null> {
  const scope = await loadSyntheticScope(db);
  if (!scope.hidden || scope.demoConnectionIds.length === 0) return null;
  if (!(await realMetaSyncHasLanded(db))) return null;
  const result = await purgeSyntheticData(db);
  return result.connections > 0 ? result : null;
}
