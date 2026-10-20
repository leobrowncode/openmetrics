import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { adAccounts, clients, dashboards, metaConnections } from "../db/schema";
import { env } from "../env";

export function demoModeEnabled(): boolean {
  return env().DEMO_MODE === "true";
}

export interface PublicDemoDashboard {
  id: string;
  name: string;
  clientName: string;
  accounts: string[];
}

/**
 * Dashboards safe to show without a login: DEMO_MODE is on, and every ad
 * account of the client comes from the synthetic source. A real Meta account
 * on the same client keeps the dashboard private.
 */
export async function listPublicDemoDashboards(db: Db): Promise<PublicDemoDashboard[]> {
  if (!demoModeEnabled()) return [];

  const rows = await db
    .select({
      dashboardId: dashboards.id,
      dashboardName: dashboards.name,
      clientId: clients.id,
      clientName: clients.name,
      accountName: adAccounts.name,
      kind: metaConnections.kind,
    })
    .from(dashboards)
    .innerJoin(clients, eq(clients.id, dashboards.clientId))
    .innerJoin(adAccounts, eq(adAccounts.clientId, clients.id))
    .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId));

  const grouped = new Map<string, PublicDemoDashboard & { real: boolean }>();
  for (const row of rows) {
    const current = grouped.get(row.dashboardId) ?? {
      id: row.dashboardId,
      name: row.dashboardName,
      clientName: row.clientName,
      accounts: [],
      real: false,
    };
    if (row.kind !== "demo") current.real = true;
    else if (!current.accounts.includes(row.accountName)) current.accounts.push(row.accountName);
    grouped.set(row.dashboardId, current);
  }

  return [...grouped.values()]
    .filter((row) => !row.real && row.accounts.length > 0)
    .map((row) => ({ id: row.id, name: row.name, clientName: row.clientName, accounts: row.accounts }));
}

export async function getPublicDemoDashboard(db: Db, dashboardId: string) {
  const listed = await listPublicDemoDashboards(db);
  const match = listed.find((row) => row.id === dashboardId);
  if (!match) return null;
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) return null;
  return { dashboard, clientName: match.clientName };
}
