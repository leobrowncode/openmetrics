import { ActionForm } from "@/components/admin/ActionForm";
import { ConnectionStatusBadge, TokenExpiryBadge, isTokenExpiringSoon } from "@/components/admin/status";
import { Badge, Button, Card, CardHeader, Field, Notice, PageHeader, buttonClass, formatDateTime, inputClass } from "@/components/ui";
import { plainDashes } from "@/lib/text";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { accountCountsByConnection } from "@/server/admin/counts";
import { metaConnections } from "@/server/db/schema";
import { metaOAuthConfig } from "@/server/meta/connections";
import { META_OAUTH_PATH, META_OAUTH_RESULTS, metaRedirectUri, type MetaOAuthResult } from "@/server/meta/oauth-flow";
import { getSyntheticDisplay, hasRealMetaAccount } from "@/server/settings/synthetic";
import { syntheticAccountsVisible } from "@/lib/synthetic-display";
import { appOrigin } from "../actions/context";
import { createConnectionAction, deleteConnectionAction, replaceTokenAction, testConnectionAction } from "../actions/connections";
import { setSyntheticDisplayAction } from "../actions/settings";

export default async function ConnectionsPage({ searchParams }: PageProps<"/admin/connections">) {
  await requireAdmin();
  const db = await getDb();
  const accountCounts = await accountCountsByConnection(db);
  const connections = (await db.select().from(metaConnections).orderBy(metaConnections.label)).map((connection) => ({
    connection,
    accounts: accountCounts.get(connection.id) ?? 0,
  }));

  const syntheticDisplay = await getSyntheticDisplay(db);
  const hasRealAccount = syntheticDisplay === "auto" ? await hasRealMetaAccount(db) : false;
  const syntheticVisible = syntheticAccountsVisible({
    display: syntheticDisplay,
    instanceHasRealAccount: syntheticDisplay === "auto" && hasRealAccount,
  });
  const syntheticStatus =
    syntheticDisplay === "hide"
      ? "Les données synthétiques sont masquées sur tout le site."
      : syntheticDisplay === "show"
        ? "Les données synthétiques restent visibles. Un client qui a aussi un compte Meta réel n'affiche plus ses comptes de démonstration."
        : hasRealAccount
          ? "Un compte Meta réel est relié : les données synthétiques sont masquées."
          : "Les données synthétiques sont visibles tant qu'aucun compte Meta réel n'est relié.";

  const oauthEnabled = metaOAuthConfig() !== null;
  const redirectUri = metaRedirectUri(await appOrigin());
  const resultKey = (await searchParams).meta;
  const result = typeof resultKey === "string" && resultKey in META_OAUTH_RESULTS ? META_OAUTH_RESULTS[resultKey as MetaOAuthResult] : null;

  return (
    <>
      <PageHeader
        title="Connexions Meta Ads"
        description="Les tokens sont chiffrés (AES-256-GCM) côté serveur et ne sont jamais renvoyés au navigateur. L'application n'effectue que des lectures."
      />
      {result && (
        <div className="mb-6">
          <Notice tone={result.tone}>{result.text}</Notice>
        </div>
      )}
      <Card className="mb-6">
        <CardHeader
          title="Données synthétiques"
          description="Les chiffres de démonstration servent à parcourir le site avant une connexion Meta. Ils ne viennent pas de Meta."
        />
        <div className="space-y-4 p-5">
          <Notice tone={syntheticVisible ? "amber" : "blue"}>{syntheticStatus}</Notice>
          <ActionForm action={setSyntheticDisplayAction} submitLabel="Enregistrer l'affichage">
            <Field label="Données synthétiques sur le site">
              <select name="syntheticDisplay" defaultValue={syntheticDisplay} className={inputClass} aria-label="Données synthétiques sur le site">
                <option value="auto">Automatique — masquer dès qu&apos;un compte Meta réel est relié</option>
                <option value="hide">Masquer — ne plus les afficher, même sans compte Meta</option>
                <option value="show">Afficher — les garder visibles sur les clients sans compte réel</option>
              </select>
            </Field>
          </ActionForm>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {connections.map(({ connection, accounts }) => (
            <Card key={connection.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {plainDashes(connection.label)} <ConnectionStatusBadge status={connection.status} />
                    <TokenExpiryBadge expiresAt={connection.tokenExpiresAt} />
                    {connection.kind === "demo" && <Badge tone="amber">Données synthétiques</Badge>}
                  </span>
                }
                description={`${accounts} compte(s) rattaché(s) · vérifiée le ${formatDateTime(connection.lastCheckedAt)}`}
              />
              <div className="space-y-4 p-5">
                {connection.lastError && <Notice tone="red">{connection.lastError}</Notice>}
                {connection.kind === "meta" && isTokenExpiringSoon(connection.tokenExpiresAt) && (
                  <Notice>
                    Ce token arrive à expiration : les synchronisations s&apos;arrêteront ensuite. Reconnectez-vous avec Facebook ou remplacez-le par
                    un token d&apos;utilisateur système (sans expiration).
                  </Notice>
                )}
                {connection.grantedScopes.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Permissions : {connection.grantedScopes.map((s) => <code key={s} className="mr-1">{s}</code>)}
                  </p>
                )}
                <div className="flex flex-wrap items-start gap-3">
                  <ActionForm action={testConnectionAction} hidden={{ connectionId: connection.id }} submitLabel="Tester la connexion" variant="secondary" />
                  {connection.kind === "meta" && oauthEnabled && (
                    <a href={`${META_OAUTH_PATH}/start?connectionId=${encodeURIComponent(connection.id)}`} className={buttonClass("secondary")}>
                      Reconnecter avec Facebook
                    </a>
                  )}
                  {accounts === 0 && (
                    <form action={deleteConnectionAction}>
                      <input type="hidden" name="connectionId" value={connection.id} />
                      <Button variant="danger">Supprimer</Button>
                    </form>
                  )}
                </div>
                {connection.kind === "meta" && (
                  <details>
                    <summary className="cursor-pointer text-sm text-brand-700">Remplacer le token manuellement</summary>
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
          {connections.length === 0 && <Notice>Aucune connexion. Connectez un compte Meta pour rattacher des comptes publicitaires.</Notice>}
        </div>

        <div className="space-y-6 self-start">
          <Card>
            <CardHeader title="Se connecter avec Facebook" />
            <div className="space-y-4 p-5">
              {oauthEnabled ? (
                <>
                  <p className="text-sm text-slate-600">
                    Vous serez redirigé vers Facebook pour autoriser la seule permission <code>ads_read</code> (lecture des statistiques). Aucun
                    mot de passe Facebook ne transite par cette application.
                  </p>
                  <a href={`${META_OAUTH_PATH}/start`} className={buttonClass("primary")}>
                    Se connecter avec Facebook
                  </a>
                </>
              ) : (
                <Notice tone="blue" title="Non configuré">
                  Renseignez <code>META_APP_ID</code> et <code>META_APP_SECRET</code> (app Meta de l&apos;agence) dans les variables
                  d&apos;environnement de l&apos;hébergement pour activer ce bouton. Voir le guide d&apos;installation.
                </Notice>
              )}
              <div className="text-xs text-slate-500">
                URL de redirection à déclarer dans l&apos;app Meta (Facebook Login → Paramètres) :
                <code className="mt-1 block break-all rounded bg-slate-50 p-2 text-slate-700">{redirectUri}</code>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Option avancée : token d'utilisateur système" />
            <div className="space-y-4 p-5">
              <Notice tone="blue" title="Sans expiration">
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
      </div>
    </>
  );
}
