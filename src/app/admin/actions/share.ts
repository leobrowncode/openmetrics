"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { dashboards } from "@/server/db/schema";
import {
  createShareLink,
  renewShareLink,
  revokeShareLink,
  ShareLinkError,
  updateShareLinkExpiry,
} from "@/server/share/share-links";
import { adminContext, appOrigin, formString, shareUrl, type ActionState } from "./context";

const EXPIRY_DAYS: Record<string, number | null> = { never: null, "7": 7, "30": 30, "90": 90, "365": 365 };

function parseExpiry(formData: FormData): Date | null | "invalid" {
  const choice = formString(formData, "expiry");
  if (choice === "custom") {
    const date = formString(formData, "expiresOn");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "invalid";
    const value = new Date(`${date}T23:59:59Z`);
    return Number.isNaN(value.getTime()) || value.getTime() <= Date.now() ? "invalid" : value;
  }
  if (!(choice in EXPIRY_DAYS)) return "invalid";
  const days = EXPIRY_DAYS[choice];
  return days === null ? null : new Date(Date.now() + days * 86_400_000);
}

export async function createShareLinkAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const dashboardId = formString(formData, "dashboardId");
  const label = formString(formData, "label");
  const expiresAt = parseExpiry(formData);
  if (label.length < 1 || label.length > 120) return { error: "Indiquez un libellé (ex. « Direction marketing client »)." };
  if (expiresAt === "invalid") return { error: "Date d'expiration invalide (elle doit être dans le futur)." };
  const [dashboard] = await db.select({ id: dashboards.id }).from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) return { error: "Dashboard introuvable." };

  const bilanId = formString(formData, "bilanId");
  let created: Awaited<ReturnType<typeof createShareLink>>;
  try {
    created = await createShareLink(db, { dashboardId, label, expiresAt, bilanId: bilanId || null });
  } catch (error) {
    if (error instanceof ShareLinkError) return { error: error.message };
    throw error;
  }
  const { link, token } = created;
  await log("share_link.create", "share_link", link.id, { dashboardId, bilanId: bilanId || null, expiresAt: expiresAt?.toISOString() ?? null });
  revalidatePath(`/admin/dashboards/${dashboardId}/share`);
  if (bilanId) revalidatePath(`/admin/dashboards/${dashboardId}/bilans/${bilanId}`);
  return { ok: true, shareUrl: shareUrl(await appOrigin(), token) };
}

export async function renewShareLinkAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const dashboardId = formString(formData, "dashboardId");
  const linkId = formString(formData, "linkId");
  const expiresAt = parseExpiry(formData);
  if (expiresAt === "invalid") return { error: "Date d'expiration invalide." };
  const renewed = await renewShareLink(db, dashboardId, linkId, expiresAt);
  if (!renewed) return { error: "Lien introuvable." };
  await log("share_link.renew", "share_link", renewed.link.id, { replaces: linkId });
  revalidatePath(`/admin/dashboards/${dashboardId}/share`);
  return { ok: true, shareUrl: shareUrl(await appOrigin(), renewed.token) };
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const dashboardId = formString(formData, "dashboardId");
  const linkId = formString(formData, "linkId");
  await revokeShareLink(db, dashboardId, linkId);
  await log("share_link.revoke", "share_link", linkId, { dashboardId });
  revalidatePath(`/admin/dashboards/${dashboardId}/share`);
}

export async function updateShareExpiryAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const dashboardId = formString(formData, "dashboardId");
  const linkId = formString(formData, "linkId");
  const expiresAt = parseExpiry(formData);
  if (expiresAt === "invalid") return { error: "Date d'expiration invalide." };
  await updateShareLinkExpiry(db, dashboardId, linkId, expiresAt);
  await log("share_link.expiry", "share_link", linkId, { expiresAt: expiresAt?.toISOString() ?? null });
  revalidatePath(`/admin/dashboards/${dashboardId}/share`);
  return { ok: true, message: "Expiration mise à jour." };
}
