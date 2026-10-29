import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { SyncStatusBadge } from "@/components/admin/status";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Notice, PageHeader, formatDateTime, inputClass } from "@/components/ui";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { adAccounts, clients, dashboards, dashboardTemplates, metaConnections } from "@/server/db/schema";
import { defaultSourceFactory, observedActionTypes } from "@/server/sync/sync-service";
import type { MetaAdAccountInfo } from "@/server/meta/source";
import { describeMetaError, MetaApiError } from "@/server/meta/errors";
import {
  addAdAccountAction,
  deleteClientAction,
  removeAdAccountAction,
  renameClientAction,
  setAccountActiveAction,
  setConversionTypesAction,
} from "../../actions/clients";
import { createDashboardAction } from "../../actions/dashboards";
import { syncNowAction } from "../../actions/sync";

export default async function ClientPage(props: PageProps<"/admin/clients/[clientId]">) {
  await requireAdmin();
  const { clientId } = await props.params;
  const db = await getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) notFound();

  const [accounts, clientDashboards, templates, connections] = await Promise.all([
    db.select().from(adAccounts).where(eq(adAccounts.clientId, clientId)).orderBy(adAccounts.name),
    db.select().from(dashboards).where(eq(dashboards.clientId, clientId)).orderBy(desc(dashboards.updatedAt)),
    db.select().from(dashboardTemplates).orderBy(desc(dashboardTemplates.builtIn), dashboardTemplates.name),
    db.select().from(metaConnections).where(eq(metaConnections.status, "active")),
  ]);
  const observed = new Map(await Promise.all(accounts.map(async (a) => [a.id, await observedActionTypes(db, a.id)] as const)));

  return (
    <>
      <PageHeader
        title={client.name}
        description="Comptes publicitaires, paramétrage des conversions et dashboards de ce client."
        actions={
          <form action={renameClientAction} className="flex gap-2">
            <input type="hidden" name="clientId" value={client.id} />
            <input name="name" defaultValue={client.name} className={inputClass} aria-label="Nom du client" />
            <Button variant="secondary" type="submit">
              Renommer
            </Button>
          </form>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Comptes publicitaires Meta" description="Accès en lecture seule. Un compte ne peut appartenir qu'à un seul client." />
          {accounts.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucun compte rattaché">Ajoutez un compte ci-dessous.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {accounts.map((account) => {
                const types = observed.get(account.id) ?? [];
                return (
                  <li key={account.id} className="space-y-4 px-5 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {account.name} {!account.isActive && <Badge>Désactivé</Badge>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {account.metaAccountId} · {account.currency} · {account.timezoneName} · dernière actualisation {formatDateTime(account.lastSyncedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <SyncStatusBadge status={account.lastSyncStatus} />
                        <ActionForm action={syncNowAction} hidden={{ accountId: account.id }} submitLabel="Synchroniser" variant="secondary" className="flex items-start gap-2 space-y-0" />
                        <form action={setAccountActiveAction}>
                          <input type="hidden" name="accountId" value={account.id} />
                          <input type="hidden" name="active" value={String(!account.isActive)} />
                          <Button variant="ghost" size="sm">
                            {account.isActive ? "Désactiver" : "Réactiver"}
                          </Button>
                        </form>
                        <form action={removeAdAccountAction}>
                          <input type="hidden" name="accountId" value={account.id} />
                          <input type="hidden" name="clientId" value={client.id} />
                          <Button variant="danger" size="sm">
                            Retirer
                          </Button>
                        </form>
                      </div>
                    </div>

                    <details className="rounded-lg border border-slate-200 bg-slate-50 p-4" open={account.conversionActionTypes.length === 0}>
                      <summary className="cursor-pointer text-sm font-medium text-slate-800">
                        Conversions comptées :{" "}
                        {account.conversionActionTypes.length ? (
                          <code className="text-xs">{account.conversionActionTypes.join(", ")}</code>
                        ) : (
                          <span className="text-amber-700">non configuré</span>
                        )}
                      </summary>
                      <p className="mt-2 text-xs text-slate-600">
                        Sélectionnez l&apos;événement Meta qui correspond à une conversion pour ce client (ex. don, achat, lead). Meta publie un même événement
                        sous plusieurs noms (purchase, omni_purchase, offsite_conversion.fb_pixel_purchase) : n&apos;en cochez qu&apos;un par événement.
                      </p>
                      <ActionForm action={setConversionTypesAction} hidden={{ accountId: account.id }} submitLabel="Enregistrer et recalculer" className="mt-3">
                        <div className="grid gap-1 sm:grid-cols-2">
                          {types.map((t) => (
                            <label key={t.actionType} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="actionTypes" value={t.actionType} defaultChecked={account.conversionActionTypes.includes(t.actionType)} />
                              <code className="text-xs">{t.actionType}</code>
                              <span className="text-xs text-slate-500">
                                ({new Intl.NumberFormat("fr-FR").format(t.total)} sur l&apos;historique)
                              </span>
                            </label>
                          ))}
                          {types.length === 0 && <p className="text-sm text-slate-500">Aucune action observée pour l&apos;instant (synchronisation en attente).</p>}
                        </div>
                        <Field label="Autre type d'action (optionnel)">
                          <input name="customActionType" className={inputClass} placeholder="offsite_conversion.custom.123456" />
                        </Field>
                      </ActionForm>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-slate-100 p-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Ajouter un compte</h3>
            {connections.length === 0 ? (
              <Notice>
                Aucune connexion Meta active. <Link className="underline" href="/admin/connections">Ajouter une connexion</Link>
              </Notice>
            ) : (
              <Suspense fallback={<p className="text-sm text-slate-500">Recherche des comptes Meta…</p>}>
                <AvailableAccounts clientId={client.id} connections={connections} />
              </Suspense>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Dashboards" />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <ul className="space-y-2">
              {clientDashboards.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/dashboards/${d.id}`} className="block rounded-lg border border-slate-200 px-4 py-3 hover:border-brand-500">
                    <p className="font-medium text-slate-900">{d.name}</p>
                    <p className="text-xs text-slate-500">Modifié le {formatDateTime(d.updatedAt)}</p>
                  </Link>
                </li>
              ))}
              {clientDashboards.length === 0 && <EmptyState title="Aucun dashboard" />}
            </ul>
            <ActionForm action={createDashboardAction} hidden={{ clientId: client.id }} submitLabel="Créer le dashboard">
              <Field label="Nom">
                <input name="name" required className={inputClass} defaultValue={`${client.name} — Reporting Meta Ads`} />
              </Field>
              <Field label="Modèle">
                <select name="templateId" className={inputClass}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            </ActionForm>
          </div>
        </Card>

        <Card>
          <CardHeader title="Zone sensible" />
          <form action={deleteClientAction} className="flex flex-wrap items-end gap-3 p-5">
            <input type="hidden" name="clientId" value={client.id} />
            <Field label="Supprimer ce client, ses comptes, données et dashboards" hint="Tapez SUPPRIMER pour confirmer. Les liens privés associés cessent immédiatement de fonctionner.">
              <input name="confirm" className={inputClass} autoComplete="off" />
            </Field>
            <Button variant="danger">Supprimer le client</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

async function AvailableAccounts({
  clientId,
  connections,
}: {
  clientId: string;
  connections: Array<typeof metaConnections.$inferSelect>;
}) {
  const db = await getDb();
  const linked = new Set((await db.select({ id: adAccounts.metaAccountId }).from(adAccounts)).map((account) => account.id));
  const available = await Promise.all(
    connections.map(async (connection) => {
      try {
        const list = await defaultSourceFactory(connection).listAdAccounts();
        return { connectionId: connection.id, connectionLabel: connection.label, accounts: list.filter((account) => !linked.has(account.metaAccountId)) };
      } catch (error) {
        return {
          connectionId: connection.id,
          connectionLabel: connection.label,
          accounts: [] as MetaAdAccountInfo[],
          error: error instanceof MetaApiError ? describeMetaError(error) : "Liste des comptes indisponible.",
        };
      }
    }),
  );

  return (
    <div className="space-y-4">
      {available.map((group) => (
        <div key={group.connectionId}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{group.connectionLabel}</p>
          {group.error ? (
            <Notice tone="red">{group.error}</Notice>
          ) : group.accounts.length === 0 ? (
            <p className="text-sm text-slate-500">Tous les comptes accessibles sont déjà rattachés à un client.</p>
          ) : (
            <ActionForm
              action={addAdAccountAction}
              hidden={{ clientId, connectionId: group.connectionId }}
              submitLabel="Rattacher ce compte"
              className="flex flex-wrap items-start gap-2 space-y-0"
            >
              <select name="metaAccountId" className={`${inputClass} w-auto`} aria-label="Compte publicitaire">
                {group.accounts.map((account) => (
                  <option key={account.metaAccountId} value={account.metaAccountId}>
                    {account.name} ({account.metaAccountId}, {account.currency})
                  </option>
                ))}
              </select>
            </ActionForm>
          )}
        </div>
      ))}
    </div>
  );
}
