import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { bilans, dashboards, shareLinks } from "../db/schema";
import { decryptSecret, encryptSecret } from "../security/encryption";
import { generateToken, hashToken, isWellFormedToken } from "../security/tokens";
import { syntheticClientHidden } from "../settings/synthetic-scope";

export type ShareLink = typeof shareLinks.$inferSelect;
export type Dashboard = typeof dashboards.$inferSelect;

export type ShareLinkState = "active" | "expired" | "revoked";

export function shareLinkState(link: Pick<ShareLink, "revokedAt" | "expiresAt">, now = new Date()): ShareLinkState {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

/** Thrown when a share link cannot be created for the requested dashboard. */
export class ShareLinkError extends Error {}

/** Admin-facing URL. Null when this link was created before the token was kept, or the ciphertext cannot be read. */
export function shareLinkUrl(origin: string, encryptedToken: string | null): string | null {
  if (!encryptedToken) return null;
  try {
    const token = decryptSecret(encryptedToken);
    if (!isWellFormedToken(token)) return null;
    return `${origin.replace(/\/$/, "")}/share#t=${token}`;
  } catch {
    return null;
  }
}

export async function createShareLink(
  db: Db,
  input: { dashboardId: string; label: string; expiresAt: Date | null; bilanId?: string | null },
): Promise<{ link: ShareLink; token: string }> {
  if (input.bilanId) {
    const [bilan] = await db
      .select({ id: bilans.id })
      .from(bilans)
      .where(and(eq(bilans.id, input.bilanId), eq(bilans.dashboardId, input.dashboardId)));
    if (!bilan) throw new ShareLinkError("Bilan introuvable pour ce dashboard.");
  }
  const token = generateToken();
  const [link] = await db
    .insert(shareLinks)
    .values({
      dashboardId: input.dashboardId,
      label: input.label,
      tokenHash: hashToken(token, "share"),
      encryptedToken: encryptSecret(token),
      expiresAt: input.expiresAt,
      bilanId: input.bilanId ?? null,
    })
    .returning();
  return { link, token };
}

export async function listShareLinks(db: Db, dashboardId: string): Promise<ShareLink[]> {
  return db.select().from(shareLinks).where(eq(shareLinks.dashboardId, dashboardId)).orderBy(desc(shareLinks.createdAt));
}

export async function revokeShareLink(db: Db, dashboardId: string, linkId: string, now = new Date()): Promise<void> {
  await db
    .update(shareLinks)
    .set({ revokedAt: now })
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.dashboardId, dashboardId), sql`${shareLinks.revokedAt} is null`));
}

/** Revokes the link and issues a new one with the same label and expiry policy. */
export async function renewShareLink(
  db: Db,
  dashboardId: string,
  linkId: string,
  expiresAt: Date | null,
): Promise<{ link: ShareLink; token: string } | null> {
  const [old] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.dashboardId, dashboardId)));
  if (!old) return null;
  await revokeShareLink(db, dashboardId, linkId);
  return createShareLink(db, { dashboardId, label: old.label, expiresAt, bilanId: old.bilanId });
}

export async function updateShareLinkExpiry(
  db: Db,
  dashboardId: string,
  linkId: string,
  expiresAt: Date | null,
): Promise<void> {
  await db
    .update(shareLinks)
    .set({ expiresAt })
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.dashboardId, dashboardId)));
}

export interface VerifiedShare {
  link: ShareLink;
  dashboard: Dashboard;
}

/**
 * Server-side check run on every viewer page render and data request.
 * Optionally pins the token to an expected link id (the one in the URL path).
 */
export async function verifyShareToken(
  db: Db,
  token: unknown,
  options: { expectedLinkId?: string; now?: Date } = {},
): Promise<VerifiedShare | null> {
  if (!isWellFormedToken(token)) return null;
  const now = options.now ?? new Date();
  const [row] = await db
    .select({ link: shareLinks, dashboard: dashboards })
    .from(shareLinks)
    .innerJoin(dashboards, eq(dashboards.id, shareLinks.dashboardId))
    .where(eq(shareLinks.tokenHash, hashToken(token, "share")));
  if (!row) return null;
  if (options.expectedLinkId && row.link.id !== options.expectedLinkId) return null;
  if (shareLinkState(row.link, now) !== "active") return null;
  if (await syntheticClientHidden(db, row.dashboard.clientId)) return null;
  return row;
}

export async function recordShareAccess(db: Db, linkId: string): Promise<void> {
  await db
    .update(shareLinks)
    .set({ lastAccessedAt: new Date(), accessCount: sql`${shareLinks.accessCount} + 1` })
    .where(eq(shareLinks.id, linkId));
}
