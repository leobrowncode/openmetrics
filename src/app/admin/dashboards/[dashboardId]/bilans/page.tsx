import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Button, Card, CardHeader, EmptyState, formatDateTime } from "@/components/ui";
import { formatDateFr } from "@/lib/periods";
import { plainDashes } from "@/lib/text";
import { requireAdmin } from "@/server/auth/admin";
import { listBilans } from "@/server/dashboards/bilans";
import { getDb } from "@/server/db/client";
import { dashboards } from "@/server/db/schema";
import { deleteBilanAction } from "../../../actions/bilans";

export default async function BilansPage(props: PageProps<"/admin/dashboards/[dashboardId]/bilans">) {
  await requireAdmin();
  const { dashboardId } = await props.params;
  const db = await getDb();
  const [dashboard] = await db.select({ id: dashboards.id }).from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) notFound();
  const rows = await listBilans(db, dashboardId);

  return (
    <Card>
      <CardHeader
        title="Bilans"
        description="Un bilan fige les campagnes cochées et les dates choisies sur l’aperçu. Les chiffres suivent ensuite les synchronisations Meta."
      />
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Aucun bilan">
            Sur l’aperçu, cochez une ou plusieurs campagnes, puis « Générer un bilan ».
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((bilan) => (
            <li key={bilan.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <Link href={`/admin/dashboards/${dashboardId}/bilans/${bilan.id}`} className="font-medium text-slate-900 hover:underline">
                  {plainDashes(bilan.name)}
                </Link>
                <p className="text-xs text-slate-500">
                  {formatDateFr(bilan.rangeFrom)} - {formatDateFr(bilan.rangeTo)} · {bilan.campaignIds.length} campagne
                  {bilan.campaignIds.length > 1 ? "s" : ""} · créé le {formatDateTime(bilan.createdAt)}
                </p>
              </div>
              <form action={deleteBilanAction}>
                <input type="hidden" name="dashboardId" value={dashboardId} />
                <input type="hidden" name="bilanId" value={bilan.id} />
                <Button variant="danger" size="sm">
                  Supprimer
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
