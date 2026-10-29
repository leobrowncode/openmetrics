import { z } from "zod";
import type { DashboardConfig } from "./dashboard-config";

const idList = z.array(z.string().min(1).max(40)).max(80);

export const viewerLayoutSchema = z.object({
  sectionOrder: idList,
  hiddenSectionIds: idList,
  widgetOrder: z.record(z.string().min(1).max(40), idList),
  hiddenWidgetIds: idList,
});

export type ViewerLayout = z.infer<typeof viewerLayoutSchema>;

export const VIEWER_LAYOUT_STORAGE_PREFIX = "openmetrics.viewer-layout.v1.";

export function viewerLayoutStorageKey(dashboardId: string): string {
  return `${VIEWER_LAYOUT_STORAGE_PREFIX}${dashboardId}`;
}

export function emptyViewerLayout(config: DashboardConfig): ViewerLayout {
  return {
    sectionOrder: config.sections.map((section) => section.id),
    hiddenSectionIds: [],
    widgetOrder: Object.fromEntries(config.sections.map((section) => [section.id, section.widgets.map((widget) => widget.id)])),
    hiddenWidgetIds: [],
  };
}

/** Keeps a saved order and drops ids the agency has since removed. New blocks stay visible at the end. */
export function mergeViewerLayout(config: DashboardConfig, saved: ViewerLayout | null): ViewerLayout {
  const base = emptyViewerLayout(config);
  if (!saved) return base;
  const sectionIds = new Set(base.sectionOrder);
  const sectionOrder = [
    ...saved.sectionOrder.filter((id) => sectionIds.has(id)),
    ...base.sectionOrder.filter((id) => !saved.sectionOrder.includes(id)),
  ];
  const widgetOrder: Record<string, string[]> = {};
  for (const section of config.sections) {
    const known = new Set(section.widgets.map((widget) => widget.id));
    const previous = saved.widgetOrder[section.id] ?? [];
    widgetOrder[section.id] = [
      ...previous.filter((id) => known.has(id)),
      ...section.widgets.map((widget) => widget.id).filter((id) => !previous.includes(id)),
    ];
  }
  const widgetIds = new Set(config.sections.flatMap((section) => section.widgets.map((widget) => widget.id)));
  return {
    sectionOrder,
    hiddenSectionIds: saved.hiddenSectionIds.filter((id) => sectionIds.has(id)),
    widgetOrder,
    hiddenWidgetIds: saved.hiddenWidgetIds.filter((id) => widgetIds.has(id)),
  };
}

function orderIds<T extends { id: string }>(items: T[], order: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    ordered.push(item);
  }
  for (const item of items) {
    if (!seen.has(item.id)) ordered.push(item);
  }
  return ordered;
}

/** Applies a personal layout on top of the agency configuration. Unknown ids are ignored. */
export function applyViewerLayout(config: DashboardConfig, layout: ViewerLayout): DashboardConfig {
  const hiddenSections = new Set(layout.hiddenSectionIds);
  const hiddenWidgets = new Set(layout.hiddenWidgetIds);
  const sections = orderIds(config.sections, layout.sectionOrder).flatMap((section) => {
    if (hiddenSections.has(section.id)) return [];
    const widgets = orderIds(section.widgets, layout.widgetOrder[section.id] ?? []).filter((widget) => !hiddenWidgets.has(widget.id));
    if (section.widgets.length > 0 && widgets.length === 0) return [];
    return [{ ...section, widgets }];
  });
  return { ...config, sections };
}

export function moveId(order: string[], id: string, direction: -1 | 1): string[] {
  const index = order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = order.slice();
  const current = next[index];
  const swap = next[target];
  if (current === undefined || swap === undefined) return order;
  next[index] = swap;
  next[target] = current;
  return next;
}

export function parseViewerLayout(value: unknown): ViewerLayout | null {
  const parsed = viewerLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const layoutListeners = new Set<() => void>();

function emitLayoutChange(): void {
  for (const listener of layoutListeners) listener();
}

/** Same-tab writes do not fire the `storage` event, so subscribers are notified directly. */
export function subscribeViewerLayouts(onChange: () => void): () => void {
  layoutListeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith(VIEWER_LAYOUT_STORAGE_PREFIX)) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    layoutListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

let layoutCache: { key: string; raw: string | null; layout: ViewerLayout | null } | null = null;

/** Stable snapshot for `useSyncExternalStore`. Returns the same reference until storage changes. */
export function readViewerLayoutSnapshot(dashboardId: string): ViewerLayout | null {
  const key = viewerLayoutStorageKey(dashboardId);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  if (layoutCache?.key === key && layoutCache.raw === raw) return layoutCache.layout;
  let layout: ViewerLayout | null = null;
  if (raw) {
    try {
      layout = parseViewerLayout(JSON.parse(raw));
    } catch {
      layout = null;
    }
  }
  layoutCache = { key, raw, layout };
  return layout;
}

export function writeViewerLayout(dashboardId: string, layout: ViewerLayout): void {
  window.localStorage.setItem(viewerLayoutStorageKey(dashboardId), JSON.stringify(layout));
  layoutCache = null;
  emitLayoutChange();
}

export function clearViewerLayout(dashboardId: string): void {
  window.localStorage.removeItem(viewerLayoutStorageKey(dashboardId));
  layoutCache = null;
  emitLayoutChange();
}
