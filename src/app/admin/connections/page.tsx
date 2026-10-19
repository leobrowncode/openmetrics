import { sql } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { ConnectionStatusBadge } from "@/components/admin/status";
import { Badge, Button, Card, CardHeader, Field, Notice, PageHeader, formatDateTime, inputClass } from "@/components/ui";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { adAccounts, metaConnections } from "@/server/db/schema";
import { createConnectionAction, deleteConnectionAction, replaceTokenAction, testConnectionAction } from "../actions/connections";

export default async function ConnectionsPage() {
  await requireAdmin();
  const db = await getDb();
  const connections = await db
    .select({
      connection: metaConnections,
      accounts: sql<number>`(select count(*)::int from ${adAccounts} where ${adAccounts.connectionId} = ${metaConnections.id})`,
    })
    .from(metaConnections)
    .orderBy(metaConnections.label);

  return (
    <>
      <PageHeader
        title="Connexions Meta Ads"
        description="Les tokens sont chiffrés (AES-256-GCM) côté serveur et ne sont jamais renvoyés au navigateur. L'application n'effectue que des lectures."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {connections.map(({ connection, accounts }) => (
            <Card key={connection.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {connection.label} <ConnectionStatusBadge status={connection.status} />
                    {connection.kind === "demo" && <Badge tone="amber">Données synthétiques</Badge>}
                  </span>
                }
                description={`${accounts} compte(s) rattaché(s) · vérifiée le ${formatDateTime(connection.lastCheckedAt)}`}
              />
              <div className="space-y-4 p-5">
                {connection.lastError && <Notice tone="red">{connection.lastError}</Notice>}
                {connection.grantedScopes.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Permissions : {connection.grantedScopes.map((s) => <code key={s} className="mr-1">{s}</code>)}
                  </p>
                )}
                <div className="flex flex-wrap items-start gap-3">
                  <ActionForm action={testConnectionAction} hidden={{ connectionId: connection.id }} submitLabel="Tester la connexion" variant="secondary" />
                  {accounts === 0 && (
                    <form action={deleteConnectionAction}>
                      <input type="hidden" name="connectionId" value={connection.id} />
                      <Button variant="danger">Supprimer</Button>
                    </form>
                  )}
                </div>
                {connection.kind === "meta" && (
                  <details>
                    <summary className="cursor-pointer text-sm text-brand-700">Remplacer le token</summary>
                    <ActionForm action={replaceTokenAction} hidden={{ connectionId: connection.id }} submitLabel="Vérifier et remplacer" className="mt-3">
                      <Field label="Nouveau token">
                        <input name="token" type="password" autoComplete="off" required className={inputClass} />
                      </Field>
                    </ActionForm>
                  </details>
                )}
              </div>
            </Card>
          ))}
          {connections.length === 0 && <Notice>Aucune connexion. Ajoutez un token Meta pour rattacher des comptes publicitaires.</Notice>}
        </div>

        <Card className="self-start">
          <CardHeader title="Nouvelle connexion" />
          <div className="space-y-4 p-5">
            <Notice tone="blue" title="Recommandé : utilisateur système">
              Dans le Business Manager de l&apos;agence, créez un utilisateur système, attribuez-lui les comptes publicitaires clients en
              lecture (« Afficher les performances ») et générez un token avec la seule permission <code>ads_read</code>. Ce token
              n&apos;expire pas et ne dépend pas d&apos;un collaborateur.
            </Notice>
            <ActionForm action={createConnectionAction} submitLabel="Vérifier et enregistrer" pendingLabel="Vérification auprès de Meta…">
              <Field label="Nom">
                <input name="label" required className={inputClass} placeholder="Business Manager agence" />
              </Field>
              <Field label="Token d'accès" hint="Envoyé uniquement au serveur, chiffré avant stockage, jamais réaffiché.">
                <input name="token" type="password" autoComplete="off" required className={inputClass} />
              </Field>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}