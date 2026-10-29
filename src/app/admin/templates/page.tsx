import { desc } from "drizzle-orm";
import { Badge, Button, Card, PageHeader, formatDateTime } from "@/components/ui";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { getMetric } from "@/lib/metrics";
import { plainDashes } from "@/lib/text";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { dashboardTemplates } from "@/server/db/schema";
import { deleteTemplateAction } from "../actions/dashboards";

export default async function TemplatesPage() {
  await requireAdmin();
  const db = await getDb();
  const templates = await db.select().from(dashboardTemplates).orderBy(desc(dashboardTemplates.builtIn), dashboardTemplates.name);
  return (
    <>
      <PageHeader
        title="Modèles de dashboards"
        description="Un modèle contient uniquement la structure (sections, widgets, période, options) - jamais de données client. Créez un modèle depuis l'onglet Configuration d'un dashboard."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((t) => {
          const config = parseDashboardConfig(t.config);
          return (
            <Card key={t.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {plainDashes(t.name)} {t.builtIn && <Badge tone="blue">Intégré</Badge>}
                  </p>
                  {t.description && <p className="mt-1 text-sm text-slate-500">{t.description}</p>}
                  <p className="mt-1 text-xs text-slate-400">Créé le {formatDateTime(t.createdAt)}</p>
                </div>
                {!t.builtIn && (
                  <form action={deleteTemplateAction}>
                    <input type="hidden" name="templateId" value={t.id} />
                    <Button variant="danger" size="sm">
                      Supprimer
                    </Button>
                  </form>
                )}
              </div>
              <ol className="mt-4 space-y-1 text-sm text-slate-700">
                {config.sections.map((s, i) => (
                  <li key={s.id}>
                    <span className="font-medium">
                      {i + 1}. {s.title}
                    </span>{" "}
                    <span className="text-xs text-slate-500">
                      - {[...new Set(s.widgets.flatMap((w) => w.metrics))].map((m) => getMetric(m).shortLabel).join(", ")}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })}
      </div>
    </>
  );
}
