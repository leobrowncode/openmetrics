import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { appOrigin } from "@/app/admin/actions/context";
import { plainDashes } from "@/lib/text";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { dashboards } from "@/server/db/schema";
import { listBilans } from "@/server/dashboards/bilans";
import { listShareLinks, shareLinkState, shareLinkUrl } from "@/server/share/share-links";
import { ShareLinks, type ShareLinkRow } from "./ShareLinks";

export default async function SharePage(props: PageProps<"/admin/dashboards/[dashboardId]/share">) {
  await requireAdmin();
  const { dashboardId } = await props.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) notFound();

  const now = new Date();
  const [origin, bilanRows, rows] = await Promise.all([appOrigin(), listBilans(db, dashboardId), listShareLinks(db, dashboardId)]);
  const bilanNames = new Map(bilanRows.map((bilan) => [bilan.id, plainDashes(bilan.name)]));
  const links: ShareLinkRow[] = rows.map((link) => ({
    id: link.id,
    label: link.label,
    state: shareLinkState(link, now),
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    lastAccessedAt: link.lastAccessedAt?.toISOString() ?? null,
    accessCount: link.accessCount,
    bilanName: link.bilanId ? (bilanNames.get(link.bilanId) ?? "introuvable") : null,
    url: shareLinkUrl(origin, link.encryptedToken),
  }));

  return <ShareLinks dashboardId={dashboard.id} links={links} />;
}
