import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Card, EmptyState, PageHeader, formatDateTime } from "@/components/ui";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { activeLinkCountsByDashboard } from "@/server/admin/counts";
import { clients, dashboards } from "@/server/db/schema";

export default async function DashboardsPage() {
  await requireAdmin();
  const db = await getDb();
  const rows = await db
    .select({
      id: dashboards.id,
      name: dashboards.name,
      clientName: clients.name,
      updatedAt: dashboards.updatedAt,
    })
    .from(dashboards)
    .innerJoin(clients, eq(clients.id, dashboards.clientId))
    .orderBy(clients.name, desc(dashboards.updatedAt));
  const activeLinks = await activeLinkCountsByDashboard(db);

  return (
    <>
      <PageHeader title="Dashboards" description="Créez un dashboard depuis la fiche d'un client, à partir d'un modèle." />
      {rows.length === 0 ? (
        <EmptyState title="Aucun dashboard">
          <Link className="text-brand-600 underline" href="/admin/clients">
            Ouvrir un client
          </Link>{" "}
          pour en créer un.
        </EmptyState>
      ) : (
        <Card>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Dashboard</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Liens actifs</th>
                <th className="px-5 py-3 font-medium">Modifié</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link href={`/admin/dashboards/${d.id}`} className="font-medium text-brand-700 hover:underline">
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{d.clientName}</td>
                  <td className="px-5 py-3 tabular">{activeLinks.get(d.id) ?? 0}</td>
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
