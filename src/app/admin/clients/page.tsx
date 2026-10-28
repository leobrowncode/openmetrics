import Link from "next/link";
import { NewClientForm } from "@/components/admin/NewClientForm";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { accountCountsByClient, dashboardCountsByClient } from "@/server/admin/counts";
import { clients } from "@/server/db/schema";
import { listAvailableAdAccounts } from "@/server/meta/available-accounts";

export default async function ClientsPage() {
  await requireAdmin();
  const db = await getDb();
  const [accountCounts, dashboardCounts, available] = await Promise.all([
    accountCountsByClient(db),
    dashboardCountsByClient(db),
    listAvailableAdAccounts(db),
  ]);
  const rows = (await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name)).map((c) => ({
    ...c,
    accounts: accountCounts.get(c.id) ?? 0,
    dashboards: dashboardCounts.get(c.id) ?? 0,
  }));

  return (
    <>
      <PageHeader title="Clients" description="Chaque client regroupe ses comptes publicitaires Meta et ses dashboards. Les données ne sont jamais partagées entre clients." />
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="order-2 lg:order-1 lg:col-span-3">
          {rows.length === 0 ? (
            <EmptyState title="Aucun client">Créez un premier client pour y rattacher des comptes Meta Ads.</EmptyState>
          ) : (
            <Card>
              <ul className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/clients/${c.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50">
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <span className="text-sm text-slate-500">
                        {c.accounts} compte(s) · {c.dashboards} dashboard(s)
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card className="order-1 lg:order-2 lg:col-span-2">
          <CardHeader title="Nouveau client" description="Les comptes publicitaires déjà accessibles via Meta." />
          <div className="p-5">
            <NewClientForm accounts={available.accounts} errors={available.errors} connectionCount={available.connectionCount} />
          </div>
        </Card>
      </div>
    </>
  );
}
