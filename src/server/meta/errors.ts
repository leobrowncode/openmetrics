export type MetaErrorKind =
  | "auth"
  | "permission"
  | "rate_limit"
  | "transient"
  | "invalid_request"
  | "unknown";

export class MetaApiError extends Error {
  readonly kind: MetaErrorKind;
  readonly code: number | null;
  readonly subcode: number | null;
  readonly httpStatus: number | null;
  readonly retryAfterMs: number | null;
  readonly fbtraceId: string | null;

  constructor(args: {
    message: string;
    kind: MetaErrorKind;
    code?: number | null;
    subcode?: number | null;
    httpStatus?: number | null;
    retryAfterMs?: number | null;
    fbtraceId?: string | null;
  }) {
    super(args.message);
    this.name = "MetaApiError";
    this.kind = args.kind;
    this.code = args.code ?? null;
    this.subcode = args.subcode ?? null;
    this.httpStatus = args.httpStatus ?? null;
    this.retryAfterMs = args.retryAfterMs ?? null;
    this.fbtraceId = args.fbtraceId ?? null;
  }

  get retryable(): boolean {
    return this.kind === "transient" || this.kind === "rate_limit";
  }
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);

/** Maps Graph API error codes (developers.facebook.com/docs/graph-api/guides/error-handling). */
export function classifyMetaError(code: number | null, httpStatus: number | null): MetaErrorKind {
  if (code === 190 || code === 102 || code === 463 || code === 467) return "auth";
  if (code === 10 || (code !== null && code >= 200 && code <= 299)) return "permission";
  if (code !== null && (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014))) {
    return "rate_limit";
  }
  if (code === 1 || code === 2) return "transient";
  if (httpStatus !== null && httpStatus >= 500) return "transient";
  if (code === 100) return "invalid_request";
  return "unknown";
}

/** Human-readable explanation for the agency admin (never shown to viewers). */
export function describeMetaError(error: MetaApiError): string {
  switch (error.kind) {
    case "auth":
      return "Le token Meta est invalide ou a expiré. Générez un nouveau token (utilisateur système recommandé) et mettez à jour la connexion.";
    case "permission":
      return "Le token n'a pas accès à ce compte publicitaire ou il manque la permission ads_read. Vérifiez l'attribution du compte à l'utilisateur système dans le Business Manager.";
    case "rate_limit": {
      const minutes = error.retryAfterMs ? Math.ceil(error.retryAfterMs / 60_000) : null;
      return `Limite de requêtes Meta atteinte${minutes ? ` (accès rétabli dans ~${minutes} min)` : ""}. La synchronisation sera retentée automatiquement.`;
    }
    case "transient":
      return "Erreur temporaire côté Meta. La synchronisation sera retentée automatiquement.";
    case "invalid_request":
      return `Requête refusée par Meta : ${error.message}`;
    default:
      return `Erreur Meta inattendue : ${error.message}`;
  }
}
