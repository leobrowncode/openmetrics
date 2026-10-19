import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Button, Card, CardHeader, Field, inputClass } from "@/components/ui";
import { CHART_STYLES, WIDGET_TYPE_LABELS, WIDGET_TYPES, parseDashboardConfig } from "@/lib/dashboard-config";
import { METRIC_KEYS, getMetric } from "@/lib/metrics";
import { PERIOD_LABELS, PERIOD_PRESETS } from "@/lib/periods";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { adAccounts, clients, dashboards } from "@/server/db/schema";
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

const CHART_STYLE_LABELS = { line: "Courbe", bar: "Barres", area: "Aire" } as const;

export default async function DashboardEditPage(props: PageProps<"/admin/dashboards/[dashboardId]/edit">) {
  await requireAdmin();
  const { dashboardId } = await props.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) notFound();
  const config = parseDashboardConfig(dashboard.config);
  const accounts = await db.select().from(adAccounts).where(eq(adAccounts.clientId, dashboard.clientId)).orderBy(adAccounts.name);
  const allClients = await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name);
  const hidden = { dashboardId: dashboard.id };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {config.sections.map((section, sIndex) => (
          <Card key={section.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <form action={renameSectionAction} className="flex flex-1 gap-2">
                <input type="hidden" name="dashboardId" value={dashboard.id} />
                <input type="hidden" name="sectionId" value={section.id} />
                <input name="title" defaultValue={section.title} className={`${inputClass} font-semibold`} aria-label="Titre de section" />
                <Button variant="secondary" size="sm">
                  Renommer
                </Button>
              </form>
              <div className="flex gap-1">
                {(["up", "down"] as const).map((dir) => (
                  <form key={dir} action={moveSectionAction}>
                    <input type="hidden" name="dashboardId" value={dashboard.id} />
                    <input type="hidden" name="sectionId" value={section.id} />
                    <input type="hidden" name="direction" value={dir} />
                    <Button variant="ghost" size="sm" disabled={dir === "up" ? sIndex === 0 : sIndex === config.sections.length - 1} aria-label={dir === "up" ? "Monter la section" : "Descendre la section"}>
                      {dir === "up" ? "↑" : "↓"}
                    </Button>
                  </form>
                ))}
                <form action={deleteSectionAction}>
                  <input type="hidden" name="dashboardId" value={dashboard.id} />
                  <input type="hidden" name="sectionId" value={section.id} />
                  <Button variant="danger" size="sm">
                    Supprimer
                  </Button>
                </form>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {section.widgets.map((w, wIndex) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">
                      {WIDGET_TYPE_LABELS[w.type]}
                      {w.title ? ` — ${w.title}` : ""}
                      {w.chartStyle ? ` (${CHART_STYLE_LABELS[w.chartStyle]})` : ""}
                    </p>
                    <p className="text-xs text-slate-500">{w.metrics.map((m) => getMetric(m).label).join(" · ")}</p>
                  </div>
                  <div className="flex gap-1">
                    {(["up", "down"] as const).map((dir) => (
                      <form key={dir} action={moveWidgetAction}>
                        <input type="hidden" name="dashboardId" value={dashboard.id} />
                        <input type="hidden" name="widgetId" value={w.id} />
                        <input type="hidden" name="direction" value={dir} />
                        <Button variant="ghost" size="sm" disabled={dir === "up" ? wIndex === 0 : wIndex === section.widgets.length - 1} aria-label={dir === "up" ? "Monter" : "Descendre"}>
                          {dir === "up" ? "↑" : "↓"}
                        </Button>
                      </form>
                    ))}
                    <form action={deleteWidgetAction}>
                      <input type="hidden" name="dashboardId" value={dashboard.id} />
                      <input type="hidden" name="widgetId" value={w.id} />
                      <Button variant="ghost" size="sm">
                        Retirer
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
            <details className="border-t border-slate-100 px-5 py-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Ajouter un widget</summary>
              <ActionForm action={addWidgetAction} hidden={{ ...hidden, sectionId: section.id }} submitLabel="Ajouter" className="mt-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Type">
                    <select name="type" className={inputClass}>
                      {WIDGET_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {WIDGET_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Style (graphique)">
                    <select name="chartStyle" className={inputClass}>
                      {CHART_STYLES.map((s) => (
                        <option key={s} value={s}>
                          {CHART_STYLE_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Titre (optionnel)">
                    <input name="title" className={inputClass} maxLength={120} />
                  </Field>
                </div>
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">Indicateurs (2 max. pour un graphique)</legend>
                  <div className="mt-2 grid gap-1 sm:grid-cols-3">
                    {METRIC_KEYS.map((m) => (
                      <label key={m} className="flex items-center gap-2 text-sm" title={getMetric(m).description}>
                        <input type="checkbox" name="metrics" value={m} />
                        {getMetric(m).label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </ActionForm>
            </details>
          </Card>
        ))}
        <form action={addSectionAction} className="flex gap-2">
          <input type="hidden" name="dashboardId" value={dashboard.id} />
          <input name="title" placeholder="Titre de la nouvelle section" className={inputClass} />
          <Button variant="secondary">Ajouter une section</Button>
        </form>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Paramètres" />
          <div className="p-5">
            <ActionForm action={updateDashboardSettingsAction} hidden={hidden} submitLabel="Enregistrer">
              <Field label="Nom">
                <input name="name" defaultValue={dashboard.name} className={inputClass} required />
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
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-700">Comptes inclus</legend>
                {accounts.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="adAccountIds" value={a.id} defaultChecked={dashboard.adAccountIds.includes(a.id)} />
                    {a.name} <span className="text-xs text-slate-500">({a.currency})</span>
                  </label>
                ))}
                <p className="text-xs text-slate-500">Aucune case cochée = tous les comptes du client.</p>
              </fieldset>
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
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nom de la copie">
                <input name="name" className={inputClass} placeholder={`${dashboard.name} (copie)`} />
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
