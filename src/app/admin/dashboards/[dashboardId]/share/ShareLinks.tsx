"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { ActionForm, ShareUrlReveal } from "@/components/admin/ActionForm";
import { ShareStateBadge } from "@/components/admin/status";
import { Button, Card, CardHeader, EmptyState, Field, Notice, buttonClass, cx, formatDateTime, inputClass } from "@/components/ui";
import { plainDashes } from "@/lib/text";
import type { ActionState } from "@/app/admin/actions/context";
import {
  createShareLinkAction,
  renewShareLinkAction,
  revokeShareLinkAction,
  updateShareExpiryAction,
} from "../../../actions/share";

export type ShareLinkRow = {
  id: string;
  label: string;
  state: "active" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  bilanName: string | null;
  /** Null for a link created before the token was kept. */
  url: string | null;
};

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

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ShareLinkItem({
  link,
  url,
  dashboardId,
  onResult,
}: {
  link: ShareLinkRow;
  url?: string;
  dashboardId: string;
  onResult: (state: ActionState) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<number | null>(null);
  const copied = copyState === "copied";
  const label = plainDashes(link.label);
  const [renewState, renewAction, renewPending] = useActionState(renewShareLinkAction, null);
  const deliveredRenew = useRef<ActionState | null>(null);

  useEffect(() => {
    if (!renewState || renewState === deliveredRenew.current) return;
    deliveredRenew.current = renewState;
    onResult(renewState);
  }, [renewState, onResult]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <LinkSummary link={link} hint={copied ? "Lien copié." : undefined} />
        {link.state === "active" && (
          <form action={revokeShareLinkAction}>
            <input type="hidden" name="dashboardId" value={dashboardId} />
            <input type="hidden" name="linkId" value={link.id} />
            <Button variant="danger" size="sm">
              Révoquer
            </Button>
          </form>
        )}
      </div>
      {url ? (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            aria-label={`Lien de ${label}`}
            className={cx(inputClass, "min-w-0 flex-1 font-mono text-xs")}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            className={cx(buttonClass("secondary", "sm"), "shrink-0 px-2")}
            aria-label={copied ? `Lien de ${label} copié` : `Copier le lien de ${label}`}
            title={copied ? "Copié" : "Copier le lien"}
            onClick={() => void copy()}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      ) : link.revokedAt ? null : (
        <p className="text-xs text-slate-500">Ce lien a été créé avant l&apos;enregistrement du jeton. Renouvelez-le pour pouvoir le recopier.</p>
      )}
      <p className="sr-only" role="status">
        {copied ? `Lien de ${label} copié dans le presse-papiers.` : copyState === "error" ? "Impossible de copier le lien." : ""}
      </p>
      {url && copyState === "error" ? <p className="text-xs text-red-700">Impossible de copier. Sélectionnez le lien à gauche.</p> : null}
      {!link.revokedAt && (
        <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm text-slate-700">Modifier l&apos;expiration ou renouveler</summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <ActionForm action={updateShareExpiryAction} hidden={{ dashboardId, linkId: link.id }} submitLabel="Changer l'expiration" variant="secondary">
              <ExpiryFields />
            </ActionForm>
            <form action={renewAction} className="space-y-3">
              <input type="hidden" name="dashboardId" value={dashboardId} />
              <input type="hidden" name="linkId" value={link.id} />
              <ExpiryFields />
              <Button type="submit" variant="secondary" disabled={renewPending}>
                {renewPending ? "En cours…" : "Renouveler (révoque l'actuel)"}
              </Button>
              {renewState?.error && <Notice tone="red">{renewState.error}</Notice>}
            </form>
          </div>
        </details>
      )}
    </li>
  );
}

function LinkSummary({ link, hint }: { link: ShareLinkRow; hint?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-medium text-slate-900">
        {plainDashes(link.label)} <ShareStateBadge state={link.state} />
      </p>
      {link.bilanName && <p className="text-xs text-slate-600">Bilan : {link.bilanName}</p>}
      <p className="text-xs text-slate-500">
        Créé le {formatDateTime(link.createdAt)} · expire {link.expiresAt ? `le ${formatDateTime(link.expiresAt)}` : "jamais"}
        {link.revokedAt && ` · révoqué le ${formatDateTime(link.revokedAt)}`}
      </p>
      <p className="text-xs text-slate-500">
        {link.accessCount} ouverture(s) · dernière : {formatDateTime(link.lastAccessedAt)}
      </p>
      {hint && <p className="mt-1 text-xs font-medium text-brand-700">{hint}</p>}
    </div>
  );
}

export function ShareLinks({ dashboardId, links }: { dashboardId: string; links: ShareLinkRow[] }) {
  const [issued, setIssued] = useState<Record<string, string>>({});
  const remember = useCallback((state: ActionState) => {
    if (!state.shareUrl || !state.shareLinkId) return;
    const shareUrl = state.shareUrl;
    const shareLinkId = state.shareLinkId;
    setIssued((current) => (current[shareLinkId] === shareUrl ? current : { ...current, [shareLinkId]: shareUrl }));
  }, []);

  const orphans = Object.entries(issued).filter(([id]) => !links.some((link) => link.id === id));

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
            <li>Le lien reste affiché à gauche du bouton de copie, y compris après rechargement. Le renouveler révoque l&apos;ancien.</li>
            <li>Créez un lien par destinataire pour pouvoir révoquer un accès sans couper les autres.</li>
          </ul>
        </Notice>

        <Card>
          <CardHeader title="Liens privés" description="Historique complet, y compris les liens révoqués et expirés." />
          {orphans.map(([id, url]) => (
            <div key={id} className="border-b border-slate-100 px-5 py-4">
              <ShareUrlReveal url={url} />
            </div>
          ))}
          {links.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Aucun lien pour ce dashboard" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {links.map((link) => (
                <ShareLinkItem
                  key={link.id}
                  link={link}
                  url={link.revokedAt ? undefined : (link.url ?? issued[link.id])}
                  dashboardId={dashboardId}
                  onResult={remember}
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="self-start">
        <CardHeader title="Nouveau lien privé" />
        <div className="p-5">
          <ActionForm action={createShareLinkAction} hidden={{ dashboardId }} submitLabel="Générer le lien" onResult={remember}>
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
