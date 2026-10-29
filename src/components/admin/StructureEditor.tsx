import { ActionForm } from "@/components/admin/ActionForm";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { CHART_STYLES, WIDGET_TYPE_LABELS, WIDGET_TYPES, type DashboardSection } from "@/lib/dashboard-config";
import { METRIC_KEYS, getMetric } from "@/lib/metrics";
import { plainDashes } from "@/lib/text";
import type { ActionState } from "@/app/admin/actions/context";

const CHART_STYLE_LABELS = { line: "Courbe", bar: "Barres", area: "Aire" } as const;

type FormAction = (formData: FormData) => Promise<void>;
type StateAction = (prev: ActionState | null, formData: FormData) => Promise<ActionState>;

export function StructureEditor({
  sections,
  hidden,
  actions,
}: {
  sections: DashboardSection[];
  hidden: Record<string, string>;
  actions: {
    renameSection: FormAction;
    moveSection: FormAction;
    deleteSection: FormAction;
    addWidget: StateAction;
    moveWidget: FormAction;
    deleteWidget: FormAction;
    addSection: FormAction;
  };
}) {
  return (
    <div className="space-y-6">
      {sections.map((section, sIndex) => (
        <Card key={section.id}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <form action={actions.renameSection} className="flex flex-1 gap-2">
              <Hidden values={hidden} />
              <input type="hidden" name="sectionId" value={section.id} />
              <input name="title" defaultValue={plainDashes(section.title)} className={`${inputClass} font-semibold`} aria-label="Titre de section" />
              <Button variant="secondary" size="sm">
                Renommer
              </Button>
            </form>
            <div className="flex gap-1">
              {(["up", "down"] as const).map((dir) => (
                <form key={dir} action={actions.moveSection}>
                  <Hidden values={hidden} />
                  <input type="hidden" name="sectionId" value={section.id} />
                  <input type="hidden" name="direction" value={dir} />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={dir === "up" ? sIndex === 0 : sIndex === sections.length - 1}
                    aria-label={dir === "up" ? "Monter la section" : "Descendre la section"}
                  >
                    {dir === "up" ? "↑" : "↓"}
                  </Button>
                </form>
              ))}
              <form action={actions.deleteSection}>
                <Hidden values={hidden} />
                <input type="hidden" name="sectionId" value={section.id} />
                <Button variant="danger" size="sm">
                  Supprimer
                </Button>
              </form>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {section.widgets.map((widget, wIndex) => (
              <li key={widget.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {WIDGET_TYPE_LABELS[widget.type]}
                    {widget.title ? ` - ${plainDashes(widget.title)}` : ""}
                    {widget.chartStyle ? ` (${CHART_STYLE_LABELS[widget.chartStyle]})` : ""}
                  </p>
                  <p className="text-xs text-slate-500">{widget.metrics.map((metric) => getMetric(metric).label).join(" · ")}</p>
                </div>
                <div className="flex gap-1">
                  {(["up", "down"] as const).map((dir) => (
                    <form key={dir} action={actions.moveWidget}>
                      <Hidden values={hidden} />
                      <input type="hidden" name="widgetId" value={widget.id} />
                      <input type="hidden" name="direction" value={dir} />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={dir === "up" ? wIndex === 0 : wIndex === section.widgets.length - 1}
                        aria-label={dir === "up" ? "Monter" : "Descendre"}
                      >
                        {dir === "up" ? "↑" : "↓"}
                      </Button>
                    </form>
                  ))}
                  <form action={actions.deleteWidget}>
                    <Hidden values={hidden} />
                    <input type="hidden" name="widgetId" value={widget.id} />
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
            <ActionForm action={actions.addWidget} hidden={{ ...hidden, sectionId: section.id }} submitLabel="Ajouter" className="mt-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Type">
                  <select name="type" className={inputClass}>
                    {WIDGET_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {WIDGET_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Style (graphique)">
                  <select name="chartStyle" className={inputClass}>
                    {CHART_STYLES.map((style) => (
                      <option key={style} value={style}>
                        {CHART_STYLE_LABELS[style]}
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
                  {METRIC_KEYS.map((metric) => (
                    <label key={metric} className="flex items-center gap-2 text-sm" title={getMetric(metric).description}>
                      <input type="checkbox" name="metrics" value={metric} />
                      {getMetric(metric).label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
          </details>
        </Card>
      ))}
      <form action={actions.addSection} className="flex gap-2">
        <Hidden values={hidden} />
        <input name="title" placeholder="Titre de la nouvelle section" className={inputClass} />
        <Button variant="secondary">Ajouter une section</Button>
      </form>
    </div>
  );
}

function Hidden({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
}
