import Link from "next/link";
import { desc } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Badge, Button, Card, CardHeader, Field, PageHeader, formatDateTime, inputClass } from "@/components/ui";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { getMetric } from "@/lib/metrics";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { dashboardTemplates } from "@/server/db/schema";
import { deleteTemplateAction } from "../actions/dashboards";
import { createTemplateAction } from "../actions/templates";

export default async function TemplatesPage() {
  await requireAdmin();
  const db = await getDb();
  const templates = await db.select().from(dashboardTemplates).orderBy(desc(dashboardTemplates.builtIn), dashboardTemplates.name);
  return (
    <>
      <PageHeader
        title="Modèles de dashboards"
        description="Un modèle contient uniquement la structure (sections, widgets, période, options) — jamais de données client. Créez-en un ici, ou enregistrez la configuration d'un dashboard existant."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-4 md:grid-cols-2 lg:col-span-2">
        {templates.map((t) => {
          const config = parseDashboardConfig(t.config);
          return (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {t.name} {t.builtIn && <Badge tone="blue">Intégré</Badge>}
                  </p>
                  {t.description && <p className="mt-1 text-sm text-slate-500">{t.description}</p>}
                  <p className="mt-1 text-xs text-slate-400">Créé le {formatDateTime(t.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/templates/${t.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                    Modifier
                  </Link>
                  {!t.builtIn && (
                    <form action={deleteTemplateAction}>
                      <input type="hidden" name="templateId" value={t.id} />
                      <Button variant="danger" size="sm">
                        Supprimer
                      </Button>
                    </form>
                  )}
                </div>
              </div>
              <ol className="mt-4 space-y-1 text-sm text-slate-700">
                {config.sections.map((s, i) => (
                  <li key={s.id}>
                    <span className="font-medium">
                      {i + 1}. {s.title}
                    </span>{" "}
                    <span className="text-xs text-slate-500">
                      — {[...new Set(s.widgets.flatMap((w) => w.metrics))].map((m) => getMetric(m).shortLabel).join(", ")}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
        </div>
        <Card>
          <CardHeader title="Nouveau modèle" description="Partez de la référence agence, ou d'une structure vide à remplir." />
          <div className="p-5">
            <ActionForm action={createTemplateAction} submitLabel="Créer le modèle">
              <Field label="Nom du modèle">
                <input name="name" required minLength={2} maxLength={120} className={inputClass} placeholder="Ex. Reporting e-commerce" />
              </Field>
              <Field label="Description">
                <input name="description" maxLength={300} className={inputClass} />
              </Field>
              <Field label="Point de départ">
                <select name="base" className={inputClass} defaultValue="reference">
                  <option value="reference">Référence agence — 4 sections</option>
                  <option value="blank">Structure vide</option>
                </select>
              </Field>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
