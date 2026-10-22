import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { adAccounts, clients, dashboards, shareLinks } from "../db/schema";

/*
 * Grouped counts instead of correlated subqueries: Drizzle renders columns
 * unqualified in single-table selects, so `inner.fk = outer.id` silently
 * compared the inner table with itself.
 */

const count = sql<number>`count(*)::int`;

function toMap(rows: { key: string; n: number }[]): Map<string, number> {
  return new Map(rows.map((r) => [r.key, r.n]));
}

export async function accountCountsByConnection(db: Db): Promise<Map<string, number>> {
  return toMap(await db.select({ key: adAccounts.connectionId, n: count }).from(adAccounts).groupBy(adAccounts.connectionId));
}

export async function accountCountsByClient(db: Db): Promise<Map<string, number>> {
  return toMap(await db.select({ key: adAccounts.clientId, n: count }).from(adAccounts).groupBy(adAccounts.clientId));
}

export async function dashboardCountsByClient(db: Db): Promise<Map<string, number>> {
  return toMap(await db.select({ key: dashboards.clientId, n: count }).from(dashboards).groupBy(dashboards.clientId));
}

export async function overviewCounts(db: Db, now = new Date()): Promise<{ clients: number; accounts: number; dashboards: number; links: number }> {
  const activeLink = and(isNull(shareLinks.revokedAt), or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now)));
  const [clientRows, accountRows, dashboardRows, linkRows] = await Promise.all([
    db.select({ n: count }).from(clients),
    db.select({ n: count }).from(adAccounts).where(eq(adAccounts.isActive, true)),
    db.select({ n: count }).from(dashboards),
    db.select({ n: count }).from(shareLinks).where(activeLink),
  ]);
  return {
    clients: clientRows[0]?.n ?? 0,
    accounts: accountRows[0]?.n ?? 0,
    dashboards: dashboardRows[0]?.n ?? 0,
    links: linkRows[0]?.n ?? 0,
  };
}

export async function activeLinkCountsByDashboard(db: Db, now = new Date()): Promise<Map<string, number>> {
  return toMap(
    await db
      .select({ key: shareLinks.dashboardId, n: count })
      .from(shareLinks)
      .where(and(isNull(shareLinks.revokedAt), or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, now))))
      .groupBy(shareLinks.dashboardId),
  );
}
