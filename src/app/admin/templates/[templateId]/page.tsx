import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { StructureEditor } from "@/components/admin/StructureEditor";
import { Badge, Button, Card, CardHeader, Field, Notice, PageHeader, inputClass } from "@/components/ui";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { PERIOD_LABELS, PERIOD_PRESETS } from "@/lib/periods";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { dashboardTemplates } from "@/server/db/schema";
import {
  addTemplateSectionAction,
  addTemplateWidgetAction,
  deleteTemplateFromEditorAction,
  deleteTemplateSectionAction,
  deleteTemplateWidgetAction,
  moveTemplateSectionAction,
  moveTemplateWidgetAction,
  renameTemplateSectionAction,
  updateTemplateSettingsAction,
} from "../../actions/templates";

export default async function TemplateEditorPage(props: PageProps<"/admin/templates/[templateId]">) {
  await requireAdmin();
  const { templateId } = await props.params;
  const db = await getDb();
  const [template] = await db.select().from(dashboardTemplates).where(eq(dashboardTemplates.id, templateId));
  if (!template) notFound();
  const config = parseDashboardConfig(template.config);
  const hidden = { templateId: template.id };

  return (
    <>
      <PageHeader
        title={template.name}
        description="Un modèle décrit la structure d'un dashboard. Les chiffres d'un client n'y sont jamais enregistrés."
        actions={
          <Link href="/admin/templates" className="text-sm font-medium text-brand-700 hover:underline">
            Tous les modèles
          </Link>
        }
      />
      {template.builtIn && (
        <div className="mb-6">
          <Notice tone="blue">
            Modèle intégré. Le modifier change les prochains dashboards créés à partir de lui. Les dashboards déjà créés gardent leur propre copie.
          </Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StructureEditor
            sections={config.sections}
            hidden={hidden}
            actions={{
              renameSection: renameTemplateSectionAction,
              moveSection: moveTemplateSectionAction,
              deleteSection: deleteTemplateSectionAction,
              addWidget: addTemplateWidgetAction,
              moveWidget: moveTemplateWidgetAction,
              deleteWidget: deleteTemplateWidgetAction,
              addSection: addTemplateSectionAction,
            }}
          />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Paramètres" actions={template.builtIn ? <Badge tone="blue">Intégré</Badge> : undefined} />
            <div className="p-5">
              <ActionForm action={updateTemplateSettingsAction} hidden={hidden} submitLabel="Enregistrer">
                <Field label="Nom">
                  <input name="name" defaultValue={template.name} className={inputClass} required />
                </Field>
                <Field label="Description">
                  <input name="description" defaultValue={template.description ?? ""} className={inputClass} />
                </Field>
                <Field label="Période par défaut">
                  <select name="defaultPeriod" defaultValue={config.defaultPeriod} className={inputClass}>
                    {PERIOD_PRESETS.map((period) => (
                      <option key={period} value={period}>
                        {PERIOD_LABELS[period]}
                      </option>
                    ))}
                  </select>
                </Field>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-700">Options reprises sur les dashboards</legend>
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
                </fieldset>
              </ActionForm>
            </div>
          </Card>
          {!template.builtIn && (
            <Card>
              <CardHeader title="Supprimer" />
              <form action={deleteTemplateFromEditorAction} className="p-5">
                <input type="hidden" name="templateId" value={template.id} />
                <Button variant="danger">Supprimer le modèle</Button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
