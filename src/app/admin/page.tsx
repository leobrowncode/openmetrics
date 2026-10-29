import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { isStale, SyncStatusBadge, ConnectionStatusBadge } from "@/components/admin/status";
import { Card, CardHeader, Notice, PageHeader, formatDateTime } from "@/components/ui";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { overviewCounts } from "@/server/admin/counts";
import { adAccounts, clients, metaConnections, syncRuns } from "@/server/db/schema";
import { loadSyntheticScope } from "@/server/settings/synthetic-scope";

export default async function AdminHome() {
  await requireAdmin();
  const db = await getDb();
  const scope = await loadSyntheticScope(db);
  const realOnly = scope.hidden ? eq(metaConnections.kind, "meta") : undefined;
  const [counts, accounts, connections, recentRuns] = await Promise.all([
    overviewCounts(db, new Date(), { clientIds: scope.syntheticClientIds, accountIds: scope.demoAccountIds }),
    db
      .select({ account: adAccounts, clientName: clients.name })
      .from(adAccounts)
      .innerJoin(clients, eq(clients.id, adAccounts.clientId))
      .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
      .where(realOnly ? and(eq(adAccounts.isActive, true), realOnly) : eq(adAccounts.isActive, true))
      .orderBy(clients.name),
    db
      .select()
      .from(metaConnections)
      .where(realOnly)
      .orderBy(metaConnections.label),
    db
      .select({ run: syncRuns, accountName: adAccounts.name })
      .from(syncRuns)
      .innerJoin(adAccounts, eq(adAccounts.id, syncRuns.adAccountId))
      .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
      .where(realOnly)
      .orderBy(desc(syncRuns.startedAt))
      .limit(8),
  ]);
  const problems = accounts.filter((a) => a.account.lastSyncStatus === "error" || isStale(a.account.lastSyncedAt));
  const brokenConnections = connections.filter((c) => c.status !== "active");

  const stats = [
    { label: "Clients", value: counts.clients, href: "/admin/clients" },
    { label: "Comptes publicitaires actifs", value: counts.accounts, href: "/admin/clients" },
    { label: "Dashboards", value: counts.dashboards, href: "/admin/dashboards" },
    { label: "Liens privés actifs", value: counts.links, href: "/admin/dashboards" },
  ];

  return (
    <>
      <PageHeader title="Vue d'ensemble" description="État des comptes Meta Ads, des synchronisations et des dashboards partagés." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-500">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular">{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {brokenConnections.map((c) => (
          <Notice key={c.id} tone="red" title={`Connexion « ${c.label} » : action requise`}>
            {c.lastError ?? "La connexion n'est plus active."} <Link className="underline" href="/admin/connections">Gérer les connexions</Link>
          </Notice>
        ))}
        {problems.length > 0 && (
          <Notice title={`${problems.length} compte(s) à vérifier`}>
            Synchronisation en erreur ou données de plus de 36 h. <Link className="underline" href="/admin/syncs">Voir les synchronisations</Link>
          </Notice>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Comptes publicitaires" description="Fraîcheur des données par compte." />
          <ul className="divide-y divide-slate-100">
            {accounts.map(({ account, clientName }) => (
              <li key={account.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{account.name}</p>
                  <p className="text-xs text-slate-500">
                    {clientName} · dernière actualisation {formatDateTime(account.lastSyncedAt)}
                  </p>
                </div>
                <SyncStatusBadge status={account.lastSyncStatus} />
              </li>
            ))}
            {accounts.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">Aucun compte. Commencez par créer un client.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Dernières synchronisations" actions={<Link className="text-sm text-brand-600 hover:underline" href="/admin/syncs">Tout voir</Link>} />
          <ul className="divide-y divide-slate-100">
            {recentRuns.map(({ run, accountName }) => (
              <li key={run.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-900">{accountName}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(run.startedAt)} · {run.rowsWritten} lignes{run.errorMessage ? ` · ${run.errorMessage}` : ""}
                  </p>
                </div>
                <SyncStatusBadge status={run.status} />
              </li>
            ))}
            {recentRuns.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">Aucune synchronisation pour l&apos;instant.</li>}
          </ul>
        </Card>
      </div>
      {connections.length > 0 && (
        <p className="mt-6 text-xs text-slate-500">
          Connexions : {connections.map((c) => (
            <span key={c.id} className="mr-3 inline-flex items-center gap-1">
              {c.label} <ConnectionStatusBadge status={c.status} />
            </span>
          ))}
        </p>
      )}
    </>
  );
}
