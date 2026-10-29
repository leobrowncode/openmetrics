"use client";

import { WIDGET_TYPE_LABELS, type DashboardConfig } from "@/lib/dashboard-config";
import { moveId, type ViewerLayout } from "@/lib/viewer-layout";
import { Button } from "../ui";

export function CustomizePanel({
  config,
  layout,
  onChange,
  onReset,
}: {
  config: DashboardConfig;
  layout: ViewerLayout;
  onChange: (layout: ViewerLayout) => void;
  onReset: () => void;
}) {
  const hiddenSections = new Set(layout.hiddenSectionIds);
  const hiddenWidgets = new Set(layout.hiddenWidgetIds);
  const sections = layout.sectionOrder
    .map((id) => config.sections.find((section) => section.id === id))
    .filter((section) => section !== undefined);

  function toggle(list: string[], id: string, hidden: boolean): string[] {
    return hidden ? [...list, id] : list.filter((item) => item !== id);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Affichage de ce dashboard</p>
          <p className="mt-1 text-xs text-slate-500">
            Cochez les blocs à garder et changez leur ordre. Le choix est enregistré sur cet appareil uniquement et ne modifie pas le modèle de
            l&apos;agence.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onReset}>
          Réinitialiser
        </Button>
      </div>
      <ol className="mt-4 space-y-4">
        {sections.map((section, sectionIndex) => (
          <li key={section.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <input
                  type="checkbox"
                  checked={!hiddenSections.has(section.id)}
                  onChange={(event) =>
                    onChange({
                      ...layout,
                      hiddenSectionIds: toggle(layout.hiddenSectionIds, section.id, !event.target.checked),
                    })
                  }
                />
                {section.title}
              </label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Monter ${section.title}`}
                  disabled={sectionIndex === 0}
                  onClick={() => onChange({ ...layout, sectionOrder: moveId(layout.sectionOrder, section.id, -1) })}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Descendre ${section.title}`}
                  disabled={sectionIndex === sections.length - 1}
                  onClick={() => onChange({ ...layout, sectionOrder: moveId(layout.sectionOrder, section.id, 1) })}
                >
                  ↓
                </Button>
              </div>
            </div>
            <ul className="mt-2 space-y-1 pl-6">
              {(layout.widgetOrder[section.id] ?? []).map((widgetId, widgetIndex) => {
                const widget = section.widgets.find((item) => item.id === widgetId);
                if (!widget) return null;
                const order = layout.widgetOrder[section.id] ?? [];
                const label = widget.title || WIDGET_TYPE_LABELS[widget.type];
                return (
                  <li key={widget.id} className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={!hiddenWidgets.has(widget.id)}
                        onChange={(event) =>
                          onChange({
                            ...layout,
                            hiddenWidgetIds: toggle(layout.hiddenWidgetIds, widget.id, !event.target.checked),
                          })
                        }
                      />
                      {label}
                    </label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Monter ${label}`}
                        disabled={widgetIndex === 0}
                        onClick={() =>
                          onChange({
                            ...layout,
                            widgetOrder: { ...layout.widgetOrder, [section.id]: moveId(order, widget.id, -1) },
                          })
                        }
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Descendre ${label}`}
                        disabled={widgetIndex === order.length - 1}
                        onClick={() =>
                          onChange({
                            ...layout,
                            widgetOrder: { ...layout.widgetOrder, [section.id]: moveId(order, widget.id, 1) },
                          })
                        }
                      >
                        ↓
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
