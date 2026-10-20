import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Card, CardHeader, EmptyState, Field, PageHeader, inputClass } from "@/components/ui";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { accountCountsByClient, dashboardCountsByClient } from "@/server/admin/counts";
import { clients } from "@/server/db/schema";
import { createClientAction } from "../actions/clients";

export default async function ClientsPage() {
  await requireAdmin();
  const db = await getDb();
  const [accountCounts, dashboardCounts] = await Promise.all([accountCountsByClient(db), dashboardCountsByClient(db)]);
  const rows = (await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name)).map((c) => ({
    ...c,
    accounts: accountCounts.get(c.id) ?? 0,
    dashboards: dashboardCounts.get(c.id) ?? 0,
  }));

  return (
    <>
      <PageHeader title="Clients" description="Chaque client regroupe ses comptes publicitaires Meta et ses dashboards. Les données ne sont jamais partagées entre clients." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
        <Card>
          <CardHeader title="Nouveau client" />
          <div className="p-5">
            <ActionForm action={createClientAction} submitLabel="Créer le client">
              <Field label="Nom du client">
                <input name="name" required minLength={2} maxLength={120} className={inputClass} placeholder="Ex. Le Rocher" />
              </Field>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
