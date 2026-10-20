import "server-only";

export const META_OAUTH_COOKIE = "om_meta_oauth";
export const META_OAUTH_PATH = "/admin/connections/meta";
export const META_OAUTH_TTL_SECONDS = 600;

/** Pending authorization, kept in a signed HttpOnly cookie between redirect and callback. */
export interface PendingMetaOAuth {
  /** CSRF state echoed by Meta. */
  s: string;
  /** Admin who started the flow. */
  u: string;
  /** Connection whose token is being renewed, if any. */
  c: string | null;
  /** Expiry (epoch ms). */
  x: number;
}

export function metaRedirectUri(origin: string): string {
  return `${origin}${META_OAUTH_PATH}/callback`;
}

export const META_OAUTH_RESULTS = {
  connected: { tone: "green", text: "Connexion Meta enregistrée. Rattachez maintenant les comptes publicitaires depuis la fiche de chaque client." },
  denied: { tone: "amber", text: "Autorisation annulée sur Facebook : aucune connexion n'a été créée." },
  state: { tone: "red", text: "La demande de connexion a expiré ou n'a pas été initiée depuis cette session. Recommencez." },
  no_ads_read: { tone: "red", text: "Meta n'a pas accordé la permission ads_read : aucune statistique ne pourrait être lue. Recommencez en l'acceptant." },
  unavailable: { tone: "red", text: "La connexion Facebook n'est pas configurée (META_APP_ID et META_APP_SECRET)." },
  error: { tone: "red", text: "Meta a refusé l'échange d'autorisation. Réessayez ; si le problème persiste, vérifiez l'URL de redirection déclarée dans l'app Meta." },
} as const;

export type MetaOAuthResult = keyof typeof META_OAUTH_RESULTS;
