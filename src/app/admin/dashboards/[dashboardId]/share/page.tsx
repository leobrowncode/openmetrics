import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { plainDashes } from "@/lib/text";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { dashboards } from "@/server/db/schema";
import { listBilans } from "@/server/dashboards/bilans";
import { listShareLinks, shareLinkState } from "@/server/share/share-links";
import { ShareLinks, type ShareLinkRow } from "./ShareLinks";

export default async function SharePage(props: PageProps<"/admin/dashboards/[dashboardId]/share">) {
  await requireAdmin();
  const { dashboardId } = await props.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) notFound();

  const now = new Date();
  const bilanNames = new Map((await listBilans(db, dashboardId)).map((bilan) => [bilan.id, plainDashes(bilan.name)]));
  const links: ShareLinkRow[] = (await listShareLinks(db, dashboardId)).map((link) => ({
    id: link.id,
    label: link.label,
    state: shareLinkState(link, now),
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    lastAccessedAt: link.lastAccessedAt?.toISOString() ?? null,
    accessCount: link.accessCount,
    bilanName: link.bilanId ? (bilanNames.get(link.bilanId) ?? "introuvable") : null,
  }));

  return <ShareLinks dashboardId={dashboard.id} links={links} />;
}
