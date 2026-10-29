import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/admin/ActionForm";
import { ShareStateBadge } from "@/components/admin/status";
import { Button, Card, CardHeader, EmptyState, Field, Notice, formatDateTime, inputClass } from "@/components/ui";
import { plainDashes } from "@/lib/text";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { dashboards } from "@/server/db/schema";
import { listShareLinks, shareLinkState } from "@/server/share/share-links";
import {
  createShareLinkAction,
  renewShareLinkAction,
  revokeShareLinkAction,
  updateShareExpiryAction,
} from "../../../actions/share";

function ExpiryFields({ defaultChoice = "90" }: { defaultChoice?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Expiration">
        <select name="expiry" defaultValue={defaultChoice} className={inputClass}>
          <option value="7">Dans 7 jours</option>
          <option value="30">Dans 30 jours</option>
          <option value="90">Dans 90 jours</option>
          <option value="365">Dans 1 an</option>
          <option value="never">Jamais (révocation manuelle)</option>
          <option value="custom">Date précise…</option>
        </select>
      </Field>
      <Field label="Date précise (si choisie)">
        <input type="date" name="expiresOn" className={inputClass} />
      </Field>
    </div>
  );
}

export default async function SharePage(props: PageProps<"/admin/dashboards/[dashboardId]/share">) {
  await requireAdmin();
  const { dashboardId } = await props.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) notFound();
  const links = await listShareLinks(db, dashboardId);
  const now = new Date();

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Notice title="Comment fonctionne un lien privé">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <strong>Toute personne qui possède un lien valide peut consulter ce dashboard</strong>, sans compte ni mot de passe. Transmettez-le
              uniquement aux bonnes personnes, par un canal de confiance.
            </li>
            <li>Le lien donne accès à ce seul dashboard, en lecture seule, aux données des comptes de ce client uniquement.</li>
            <li>Révoquez-le dès qu&apos;il n&apos;est plus nécessaire ou s&apos;il a été transféré par erreur : l&apos;accès est coupé immédiatement.</li>
            <li>Le lien n&apos;est affiché qu&apos;une fois à sa création. En cas de perte, renouvelez-le (l&apos;ancien cesse de fonctionner).</li>
            <li>Créez un lien par destinataire pour pouvoir révoquer un accès sans couper les autres.</li>
          </ul>
        </Notice>

        <Card>
          <CardHeader title="Liens privés" description="Historique complet, y compris les liens révoqués et expirés." />
          {links.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucun lien pour ce dashboard" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {links.map((link) => {
                const state = shareLinkState(link, now);
                return (
                  <li key={link.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {plainDashes(link.label)} <ShareStateBadge state={state} />
                        </p>
                        <p className="text-xs text-slate-500">
                          Créé le {formatDateTime(link.createdAt)} · expire {link.expiresAt ? `le ${formatDateTime(link.expiresAt)}` : "jamais"}
                          {link.revokedAt && ` · révoqué le ${formatDateTime(link.revokedAt)}`}
                        </p>
                        <p className="text-xs text-slate-500">
                          {link.accessCount} ouverture(s) · dernière : {formatDateTime(link.lastAccessedAt)}
                        </p>
                      </div>
                      {state === "active" && (
                        <form action={revokeShareLinkAction}>
                          <input type="hidden" name="dashboardId" value={dashboard.id} />
                          <input type="hidden" name="linkId" value={link.id} />
                          <Button variant="danger" size="sm">
                            Révoquer
                          </Button>
                        </form>
                      )}
                    </div>
                    {!link.revokedAt && (
                      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-sm text-slate-700">Modifier l&apos;expiration ou renouveler</summary>
                        <div className="mt-3 grid gap-4 md:grid-cols-2">
                          <ActionForm action={updateShareExpiryAction} hidden={{ dashboardId: dashboard.id, linkId: link.id }} submitLabel="Changer l'expiration" variant="secondary">
                            <ExpiryFields />
                          </ActionForm>
                          <ActionForm action={renewShareLinkAction} hidden={{ dashboardId: dashboard.id, linkId: link.id }} submitLabel="Renouveler (révoque l'actuel)" variant="secondary">
                            <ExpiryFields />
                          </ActionForm>
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="self-start">
        <CardHeader title="Nouveau lien privé" />
        <div className="p-5">
          <ActionForm action={createShareLinkAction} hidden={{ dashboardId: dashboard.id }} submitLabel="Générer le lien">
            <Field label="Destinataire / libellé" hint="Pour savoir qui détient ce lien (non visible par le client).">
              <input name="label" required maxLength={120} className={inputClass} placeholder="Ex. Marie - Responsable communication" />
            </Field>
            <ExpiryFields />
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
