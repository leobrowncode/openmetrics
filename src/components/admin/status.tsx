import { Badge } from "../ui";

export function SyncStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case "success":
      return <Badge tone="green">Synchronisé</Badge>;
    case "error":
      return <Badge tone="red">Erreur</Badge>;
    case "running":
      return <Badge tone="blue">En cours</Badge>;
    case "skipped":
      return <Badge tone="slate">Ignoré</Badge>;
    default:
      return <Badge tone="amber">Jamais synchronisé</Badge>;
  }
}

export function ConnectionStatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, "green" | "red" | "amber" | "slate"]> = {
    active: ["Active", "green"],
    expired: ["Token expiré", "red"],
    invalid: ["Token invalide", "red"],
    permission_denied: ["Permissions insuffisantes", "red"],
    error: ["Erreur", "amber"],
  };
  const [label, tone] = map[status] ?? [status, "slate"];
  return <Badge tone={tone}>{label}</Badge>;
}

const EXPIRY_WARNING_DAYS = 14;

export function daysUntil(date: Date, now = Date.now()): number {
  return Math.floor((date.getTime() - now) / 86_400_000);
}

export function isTokenExpiringSoon(expiresAt: Date | null, now = Date.now()): boolean {
  return expiresAt !== null && daysUntil(expiresAt, now) < EXPIRY_WARNING_DAYS;
}

export function TokenExpiryBadge({ expiresAt }: { expiresAt: Date | null }) {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  if (days < 0) return <Badge tone="red">Token expiré</Badge>;
  if (days < EXPIRY_WARNING_DAYS) return <Badge tone="amber">Expire dans {days} j</Badge>;
  return <Badge tone="slate">Expire le {expiresAt.toLocaleDateString("fr-FR")}</Badge>;
}

export function ShareStateBadge({ state }: { state: "active" | "expired" | "revoked" }) {
  if (state === "active") return <Badge tone="green">Actif</Badge>;
  if (state === "expired") return <Badge tone="amber">Expiré</Badge>;
  return <Badge tone="red">Révoqué</Badge>;
}

/** Data is considered stale when the last successful sync is older than ~1.5 scheduled cycles. */
export function isStale(lastSyncedAt: Date | null, now = Date.now()): boolean {
  return !lastSyncedAt || now - lastSyncedAt.getTime() > 36 * 3_600_000;
}
