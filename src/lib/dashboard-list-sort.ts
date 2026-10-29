import { compareLabels } from "@/lib/account-search";

export const DASHBOARD_SORT_KEYS = ["name", "client", "links", "updated"] as const;

export type DashboardSortKey = (typeof DASHBOARD_SORT_KEYS)[number];
export type DashboardSortDir = "asc" | "desc";

export type DashboardSort = {
  key: DashboardSortKey;
  dir: DashboardSortDir;
};

export type DashboardSortable = {
  id: string;
  name: string;
  clientName: string;
  updatedAt: Date | string;
  activeLinks: number;
};

/** Column titles. Clicking one sorts the list. */
export const DASHBOARD_SORT_COLUMNS: { key: DashboardSortKey; label: string }[] = [
  { key: "name", label: "Dashboard" },
  { key: "client", label: "Client" },
  { key: "links", label: "Liens" },
  { key: "updated", label: "Modifié le" },
];

/** Same order the list used before column sorting existed. */
export const DEFAULT_DASHBOARD_SORT: DashboardSort = { key: "client", dir: "asc" };

export function defaultDashboardSortDir(key: DashboardSortKey): DashboardSortDir {
  return key === "links" || key === "updated" ? "desc" : "asc";
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.find((item) => item.length > 0);
  return undefined;
}

function isSortKey(value: string): value is DashboardSortKey {
  return (DASHBOARD_SORT_KEYS as readonly string[]).includes(value);
}

export function parseDashboardSort(params: { sort?: string | string[]; dir?: string | string[] }): DashboardSort {
  const sort = firstParam(params.sort);
  if (!sort || !isSortKey(sort)) return DEFAULT_DASHBOARD_SORT;
  const dir = firstParam(params.dir);
  if (dir === "asc" || dir === "desc") return { key: sort, dir };
  return { key: sort, dir: defaultDashboardSortDir(sort) };
}

/** Same column flips direction. Another column opens in its default direction. */
export function nextDashboardSort(current: DashboardSort, key: DashboardSortKey): DashboardSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: defaultDashboardSortDir(key) };
}

export function dashboardSortHref(sort: DashboardSort): string {
  const params = new URLSearchParams({ sort: sort.key, dir: sort.dir });
  return `/admin/dashboards?${params.toString()}`;
}

function updatedTime(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function primaryDelta(a: DashboardSortable, b: DashboardSortable, key: DashboardSortKey): number {
  switch (key) {
    case "name":
      return compareLabels(a.name, b.name);
    case "client":
      return compareLabels(a.clientName, b.clientName);
    case "links":
      return a.activeLinks - b.activeLinks;
    case "updated":
      return updatedTime(a.updatedAt) - updatedTime(b.updatedAt);
  }
}

/** Primary key follows the chosen direction. Ties stay newest first, then name, then id. */
export function sortDashboards<T extends DashboardSortable>(rows: readonly T[], sort: DashboardSort): T[] {
  return [...rows].sort((a, b) => {
    const primary = primaryDelta(a, b, sort.key);
    if (primary !== 0) return sort.dir === "asc" ? primary : -primary;
    const byUpdated = updatedTime(b.updatedAt) - updatedTime(a.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    const byName = compareLabels(a.name, b.name);
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}
