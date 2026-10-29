import Link from "next/link";
import { eq } from "drizzle-orm";
import { Card, EmptyState, PageHeader, cx, formatDateTime } from "@/components/ui";
import {
  DASHBOARD_SORT_COLUMNS,
  dashboardSortHref,
  nextDashboardSort,
  parseDashboardSort,
  sortDashboards,
  type DashboardSort,
  type DashboardSortKey,
} from "@/lib/dashboard-list-sort";
import { plainDashes } from "@/lib/text";
import { activeLinkCountsByDashboard } from "@/server/admin/counts";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { clients, dashboards } from "@/server/db/schema";

export default async function DashboardsPage({ searchParams }: PageProps<"/admin/dashboards">) {
  const [, query] = await Promise.all([requireAdmin(), searchParams]);
  const sort = parseDashboardSort(query);
  const db = await getDb();
  const [rows, activeLinks] = await Promise.all([
    db
      .select({
        id: dashboards.id,
        name: dashboards.name,
        clientName: clients.name,
        updatedAt: dashboards.updatedAt,
      })
      .from(dashboards)
      .innerJoin(clients, eq(clients.id, dashboards.clientId)),
    activeLinkCountsByDashboard(db),
  ]);
  const sorted = sortDashboards(
    rows.map((row) => ({ ...row, activeLinks: activeLinks.get(row.id) ?? 0 })),
    sort,
  );

  return (
    <>
      <PageHeader title="Dashboards" description="Créez un dashboard depuis la fiche d'un client, à partir d'un modèle." />
      {sorted.length === 0 ? (
        <EmptyState title="Aucun dashboard">
          <Link className="text-brand-600 underline" href="/admin/clients">
            Ouvrir un client
          </Link>{" "}
          pour en créer un.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {DASHBOARD_SORT_COLUMNS.map((column) => (
                  <SortHeader key={column.key} sort={sort} sortKey={column.key} label={column.label} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/admin/dashboards/${d.id}`} className="font-medium text-brand-700 hover:underline">
                      {plainDashes(d.name)}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{plainDashes(d.clientName)}</td>
                  <td className="px-5 py-3 tabular">{d.activeLinks}</td>
                  <td className="px-5 py-3 text-slate-500">{formatDateTime(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function SortHeader({ sort, sortKey, label }: { sort: DashboardSort; sortKey: DashboardSortKey; label: string }) {
  const active = sort.key === sortKey;
  const next = nextDashboardSort(sort, sortKey);
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="p-0 font-medium">
      <Link
        href={dashboardSortHref(next)}
        scroll={false}
        className={cx("inline-flex w-full items-center gap-1 px-5 py-3 hover:text-slate-900", active && "text-slate-900")}
      >
        {label}
        {active && <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>}
      </Link>
    </th>
  );
}
