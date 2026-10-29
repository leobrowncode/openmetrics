import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, CardHeader, Field, Notice, inputClass } from "@/components/ui";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { requireAdmin } from "@/server/auth/admin";
import { getBilan } from "@/server/dashboards/bilans";
import { loadDashboardPayload } from "@/server/dashboards/query";
import { getDb } from "@/server/db/client";
import { clients, dashboards } from "@/server/db/schema";
import { createShareLinkAction } from "../../../../actions/share";

export default async function BilanPage(props: PageProps<"/admin/dashboards/[dashboardId]/bilans/[bilanId]">) {
  await requireAdmin();
  const { dashboardId, bilanId } = await props.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) notFound();
  const bilan = await getBilan(db, dashboardId, bilanId);
  if (!bilan) notFound();
  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, dashboard.clientId));

  const lock = { range: { from: bilan.rangeFrom, to: bilan.rangeTo }, campaignIds: bilan.campaignIds };
  const payload = await loadDashboardPayload(db, dashboard, new URLSearchParams(), "admin", lock);
  if ("error" in payload) return <Notice tone="red">{payload.error}</Notice>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Lien privé de ce bilan" description="La personne qui ouvre le lien voit ces campagnes et ces dates, sans pouvoir les changer." />
        <div className="p-5">
          <ActionForm action={createShareLinkAction} hidden={{ dashboardId, bilanId }} submitLabel="Générer le lien">
            <Field label="Destinataire / libellé" hint="Pour savoir qui détient ce lien (non visible par le client).">
              <input name="label" required maxLength={120} className={inputClass} placeholder="Ex. Marie - bilan campagnes" />
            </Field>
            <Field label="Expiration">
              <select name="expiry" defaultValue="90" className={inputClass}>
                <option value="7">Dans 7 jours</option>
                <option value="30">Dans 30 jours</option>
                <option value="90">Dans 90 jours</option>
                <option value="365">Dans 1 an</option>
                <option value="never">Jamais (révocation manuelle)</option>
              </select>
            </Field>
          </ActionForm>
        </div>
      </Card>
      <DashboardView
        config={parseDashboardConfig(dashboard.config)}
        initial={payload}
        dataUrl={`/admin/dashboards/${dashboard.id}/bilans/${bilan.id}/data`}
        mode="admin"
        title={bilan.name}
        subtitle={client?.name}
        dashboardId={dashboard.id}
        locked
      />
    </div>
  );
}
