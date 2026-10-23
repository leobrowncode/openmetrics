import { desc, eq } from "drizzle-orm";
import { loadSyntheticScope } from "@/server/settings/synthetic-scope";
import { ActionForm } from "@/components/admin/ActionForm";
import { SyncStatusBadge, isStale } from "@/components/admin/status";
import { Badge, Card, CardHeader, PageHeader, formatDateTime } from "@/components/ui";
import { formatDateFr } from "@/lib/periods";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { adAccounts, clients, metaConnections, syncRuns } from "@/server/db/schema";
import { ATTRIBUTION_REFRESH_DAYS } from "@/server/sync/sync-service";
import { syncNowAction } from "../actions/sync";

const TRIGGER_LABELS = { cron: "Planifiée", manual: "Manuelle", backfill: "Import initial" } as const;

export default async function SyncsPage() {
  await requireAdmin();
  const db = await getDb();
  const scope = await loadSyntheticScope(db);
  const realOnly = scope.hidden ? eq(metaConnections.kind, "meta") : undefined;
  const [accounts, runs] = await Promise.all([
    db
      .select({ account: adAccounts, clientName: clients.name })
      .from(adAccounts)
      .innerJoin(clients, eq(clients.id, adAccounts.clientId))
      .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
      .where(realOnly)
      .orderBy(clients.name, adAccounts.name),
    db
      .select({ run: syncRuns, accountName: adAccounts.name })
      .from(syncRuns)
      .innerJoin(adAccounts, eq(adAccounts.id, syncRuns.adAccountId))
      .innerJoin(metaConnections, eq(metaConnections.id, adAccounts.connectionId))
      .where(realOnly)
      .orderBy(desc(syncRuns.startedAt))
      .limit(100),
  ]);

  return (
    <>
      <PageHeader
        title="Synchronisations"
        description={`Chaque jour, les ${ATTRIBUTION_REFRESH_DAYS} derniers jours sont réimportés : Meta met à jour les conversions pendant la fenêtre d'attribution. Chaque synchronisation remplace les données de sa période, elle peut donc être relancée sans risque de doublon.`}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Comptes" />
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Compte</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Dernière actualisation</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts.map(({ account, clientName }) => (
                <tr key={account.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{account.name}</p>
                    <p className="text-xs text-slate-500">{clientName}</p>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      <SyncStatusBadge status={account.lastSyncStatus} />
                      {!account.isActive && <Badge>Désactivé</Badge>}
                      {account.isActive && isStale(account.lastSyncedAt) && <Badge tone="amber">Données &gt; 36 h</Badge>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{formatDateTime(account.lastSyncedAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <ActionForm action={syncNowAction} hidden={{ accountId: account.id }} submitLabel="Synchroniser" variant="secondary" className="inline-block text-left" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="Historique (100 dernières)" />
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Début</th>
                <th className="px-5 py-3 font-medium">Compte</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Période</th>
                <th className="px-5 py-3 font-medium">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(({ run, accountName }) => (
                <tr key={run.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDateTime(run.startedAt)}</td>
                  <td className="px-5 py-3 text-slate-900">{accountName}</td>
                  <td className="px-5 py-3 text-slate-600">{TRIGGER_LABELS[run.trigger]}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-600 tabular">
                    {formatDateFr(run.rangeFrom)} → {formatDateFr(run.rangeTo)}
                  </td>
                  <td className="px-5 py-3">
                    <SyncStatusBadge status={run.status} />
                    <p className="mt-1 text-xs text-slate-500">
                      {run.rowsWritten} lignes · {run.apiCalls} appel(s) API
                      {run.finishedAt && ` · ${Math.max(0, Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000))} s`}
                    </p>
                    {run.errorMessage && <p className="mt-1 max-w-md text-xs text-red-700">{run.errorMessage}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
