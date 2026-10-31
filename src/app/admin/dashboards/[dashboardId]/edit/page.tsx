import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { StructureEditor } from "@/components/admin/StructureEditor";
import { ChartColorEditor } from "@/components/dashboard/ChartColorEditor";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { plainDashes } from "@/lib/text";
import { PERIOD_LABELS, PERIOD_PRESETS } from "@/lib/periods";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { adAccounts, clients, dashboards } from "@/server/db/schema";
import { loadSyntheticScope } from "@/server/settings/synthetic-scope";
import {
  addSectionAction,
  addWidgetAction,
  deleteDashboardAction,
  deleteSectionAction,
  deleteWidgetAction,
  duplicateDashboardAction,
  moveSectionAction,
  moveWidgetAction,
  renameSectionAction,
  saveAsTemplateAction,
  updateDashboardSettingsAction,
} from "../../../actions/dashboards";

export default async function DashboardEditPage(props: PageProps<"/admin/dashboards/[dashboardId]/edit">) {
  await requireAdmin();
  const { dashboardId } = await props.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) notFound();
  const config = parseDashboardConfig(dashboard.config);
  const scope = await loadSyntheticScope(db);
  const hiddenAccounts = new Set(scope.demoAccountIds);
  const hiddenClients = new Set(scope.syntheticClientIds);
  const accounts = (await db.select().from(adAccounts).where(eq(adAccounts.clientId, dashboard.clientId)).orderBy(adAccounts.name)).filter(
    (account) => !hiddenAccounts.has(account.id),
  );
  const allClients = (await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name)).filter(
    (client) => !hiddenClients.has(client.id),
  );
  const hidden = { dashboardId: dashboard.id };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <StructureEditor
          sections={config.sections}
          hidden={hidden}
          actions={{
            renameSection: renameSectionAction,
            moveSection: moveSectionAction,
            deleteSection: deleteSectionAction,
            addWidget: addWidgetAction,
            moveWidget: moveWidgetAction,
            deleteWidget: deleteWidgetAction,
            addSection: addSectionAction,
          }}
        />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Couleurs des courbes" description="Enregistrées pour ce dashboard uniquement." />
          <div className="p-5">
            <ChartColorEditor dashboardId={dashboard.id} initialColors={config.chartColors} variant="panel" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Paramètres" />
          <div className="p-5">
            <ActionForm action={updateDashboardSettingsAction} hidden={hidden} submitLabel="Enregistrer">
              <Field label="Nom">
                <input name="name" defaultValue={plainDashes(dashboard.name)} className={inputClass} required />
              </Field>
              <Field label="Période par défaut">
                <select name="defaultPeriod" defaultValue={config.defaultPeriod} className={inputClass}>
                  {PERIOD_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {PERIOD_LABELS[p]}
                    </option>
                  ))}
                </select>
              </Field>
              {accounts.length > 1 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-700">Comptes inclus</legend>
                  {accounts.map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="adAccountIds" value={a.id} defaultChecked={dashboard.adAccountIds.includes(a.id)} />
                      {plainDashes(a.name)} <span className="text-xs text-slate-500">({a.currency})</span>
                    </label>
                  ))}
                  <p className="text-xs text-slate-500">Aucune case cochée = tous les comptes du client.</p>
                </fieldset>
              )}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">Options</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="compare" defaultChecked={config.compareToPreviousPeriod} /> Comparer à la période précédente
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="allowPeriodChange" defaultChecked={config.viewer.allowPeriodChange} /> Le client peut changer la période
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="allowCampaignFilter" defaultChecked={config.viewer.allowCampaignFilter} /> Le client peut filtrer par campagne
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="allowCustomize" defaultChecked={config.viewer.allowCustomize} /> Le client peut réorganiser et masquer des blocs
                </label>
                <p className="text-xs text-slate-500">La disposition choisie par le client reste sur son appareil. Elle ne change pas ce modèle.</p>
              </fieldset>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="Dupliquer" description="La configuration est copiée ; les données restent celles du client cible." />
          <div className="p-5">
            <ActionForm action={duplicateDashboardAction} hidden={hidden} submitLabel="Dupliquer" variant="secondary">
              <Field label="Client cible">
                <select name="targetClientId" defaultValue={dashboard.clientId} className={inputClass}>
                  {allClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {plainDashes(c.name)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nom de la copie">
                <input name="name" className={inputClass} placeholder={`${plainDashes(dashboard.name)} (copie)`} />
              </Field>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="Enregistrer comme modèle" />
          <div className="p-5">
            <ActionForm action={saveAsTemplateAction} hidden={hidden} submitLabel="Créer le modèle" variant="secondary">
              <Field label="Nom du modèle">
                <input name="name" className={inputClass} required />
              </Field>
              <Field label="Description">
                <input name="description" className={inputClass} />
              </Field>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="Supprimer" />
          <form action={deleteDashboardAction} className="space-y-3 p-5">
            <input type="hidden" name="dashboardId" value={dashboard.id} />
            <Field label="Tapez SUPPRIMER" hint="Tous les liens privés de ce dashboard cessent immédiatement de fonctionner.">
              <input name="confirm" className={inputClass} autoComplete="off" />
            </Field>
            <Button variant="danger">Supprimer le dashboard</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
