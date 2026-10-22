import type { DashboardConfig, DashboardSection, DashboardWidget } from "./dashboard-config";

export function moveItem<T>(list: T[], index: number, direction: number): void {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return;
  const current = list[index];
  const swap = list[target];
  if (current === undefined || swap === undefined) return;
  list[index] = swap;
  list[target] = current;
}

export function addSection(config: DashboardConfig, section: DashboardSection): void {
  if (config.sections.length >= 20) return;
  config.sections.push(section);
}

export function renameSection(config: DashboardConfig, sectionId: string, title: string): void {
  const section = config.sections.find((item) => item.id === sectionId);
  if (section && title) section.title = title;
}

export function deleteSection(config: DashboardConfig, sectionId: string): void {
  config.sections = config.sections.filter((item) => item.id !== sectionId);
}

export function moveSection(config: DashboardConfig, sectionId: string, direction: number): void {
  moveItem(config.sections, config.sections.findIndex((item) => item.id === sectionId), direction);
}

export function addWidget(config: DashboardConfig, sectionId: string, widget: DashboardWidget): boolean {
  const section = config.sections.find((item) => item.id === sectionId);
  if (!section || section.widgets.length >= 12) return false;
  section.widgets.push(widget);
  return true;
}

export function deleteWidget(config: DashboardConfig, widgetId: string): void {
  for (const section of config.sections) section.widgets = section.widgets.filter((widget) => widget.id !== widgetId);
}

export function moveWidget(config: DashboardConfig, widgetId: string, direction: number): void {
  for (const section of config.sections) moveItem(section.widgets, section.widgets.findIndex((widget) => widget.id === widgetId), direction);
}
