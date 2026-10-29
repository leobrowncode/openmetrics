import "server-only";
import { eq } from "drizzle-orm";
import { compareLabels } from "@/lib/account-search";
import type { Db } from "../db/client";
import { adAccounts, metaConnections } from "../db/schema";
import { describeMetaError, MetaApiError } from "./errors";
import { defaultSourceFactory } from "../sync/sync-service";

export interface AvailableAdAccount {
  connectionId: string;
  connectionLabel: string;
  metaAccountId: string;
  name: string;
  currency: string;
  timezoneName: string;
}

export interface AvailableAccountsResult {
  accounts: AvailableAdAccount[];
  errors: Array<{ connectionId: string; connectionLabel: string; message: string }>;
  connectionCount: number;
}

/** Ad accounts visible to an active Meta connection and not yet attached to a client. */
export async function listAvailableAdAccounts(db: Db): Promise<AvailableAccountsResult> {
  const [connections, linkedRows] = await Promise.all([
    db.select().from(metaConnections).where(eq(metaConnections.status, "active")),
    db.select({ id: adAccounts.metaAccountId }).from(adAccounts),
  ]);
  const linked = new Set(linkedRows.map((row) => row.id));

  const results = await Promise.all(
    connections.map(async (connection) => {
      try {
        const list = await defaultSourceFactory(connection).listAdAccounts();
        return { connection, list, error: null as string | null };
      } catch (error) {
        return {
          connection,
          list: [],
          error: error instanceof MetaApiError ? describeMetaError(error) : "Liste des comptes indisponible.",
        };
      }
    }),
  );

  const seen = new Set<string>();
  const accounts: AvailableAdAccount[] = [];
  const errors: AvailableAccountsResult["errors"] = [];
  for (const result of results) {
    if (result.error) {
      errors.push({ connectionId: result.connection.id, connectionLabel: result.connection.label, message: result.error });
    }
    for (const account of result.list) {
      if (linked.has(account.metaAccountId) || seen.has(account.metaAccountId)) continue;
      seen.add(account.metaAccountId);
      accounts.push({
        connectionId: result.connection.id,
        connectionLabel: result.connection.label,
        metaAccountId: account.metaAccountId,
        name: account.name,
        currency: account.currency,
        timezoneName: account.timezoneName,
      });
    }
  }
  accounts.sort((a, b) => compareLabels(a.name, b.name) || compareLabels(a.metaAccountId, b.metaAccountId));
  return { accounts, errors, connectionCount: connections.length };
}
