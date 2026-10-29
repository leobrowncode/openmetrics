import Link from "next/link";
import {
  DASHBOARD_SORT_FIELDS,
  dashboardSortHref,
  dashboardSortOrderLabel,
  defaultDashboardSortDir,
  nextDashboardSort,
  type DashboardSort,
  type DashboardSortDir,
  type DashboardSortKey,
} from "@/lib/dashboard-list-sort";
import { cx } from "@/components/ui";

function sortControlClass(active: boolean): string {
  return cx(
    "inline-flex h-10 items-center rounded-lg border px-3 text-sm shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    active ? "border-brand-600 bg-brand-50 font-medium text-brand-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  );
}

export function DashboardSortBar({ sort }: { sort: DashboardSort }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Trier par">
        <span className="text-sm font-medium text-slate-600">Trier par</span>
        {DASHBOARD_SORT_FIELDS.map((field) => {
          const active = sort.key === field.key;
          const target: DashboardSort = active ? sort : { key: field.key, dir: defaultDashboardSortDir(field.key) };
          return (
            <Link
              key={field.key}
              href={dashboardSortHref(target)}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={sortControlClass(active)}
            >
              {field.label}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ordre">
        <span className="text-sm font-medium text-slate-600">Ordre</span>
        {(["asc", "desc"] as const satisfies readonly DashboardSortDir[]).map((dir) => {
          const active = sort.dir === dir;
          return (
            <Link
              key={dir}
              href={dashboardSortHref({ key: sort.key, dir })}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={sortControlClass(active)}
            >
              {dashboardSortOrderLabel(sort.key, dir)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardSortHeader({ sort, sortKey }: { sort: DashboardSort; sortKey: DashboardSortKey }) {
  const field = DASHBOARD_SORT_FIELDS.find((item) => item.key === sortKey);
  if (!field) return null;
  const active = sort.key === field.key;
  const next = nextDashboardSort(sort, field.key);
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="px-5 py-3 font-medium">
      <Link
        href={dashboardSortHref(next)}
        scroll={false}
        className="inline-flex items-center gap-1 hover:text-slate-800"
        title={active ? "Inverser l'ordre" : `Trier par ${field.label}`}
      >
        {field.column}
        {active && <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>}
      </Link>
    </th>
  );
}
