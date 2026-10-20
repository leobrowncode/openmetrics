import { classifyMetaError, MetaApiError } from "./errors";
import { createGraphClient, redact } from "./graph-client";

/**
 * "Se connecter avec Facebook" for the agency admin. Everything here runs on
 * the server: the app secret and the resulting access token never reach the
 * browser. Only ads_read is requested; the Graph client stays GET-only.
 */

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  apiVersion: string;
  /** Facebook Login for Business configuration. Without it, the classic scope=ads_read dialog is used. */
  configId?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

export const OAUTH_SCOPES = ["ads_read"] as const;

export function buildAuthorizeUrl(config: MetaOAuthConfig, args: { redirectUri: string; state: string }): string {
  const url = new URL(`https://www.facebook.com/${config.apiVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  url.searchParams.set("response_type", "code");
  if (config.configId) url.searchParams.set("config_id", config.configId);
  else url.searchParams.set("scope", OAUTH_SCOPES.join(","));
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

async function postOAuth(config: MetaOAuthConfig, params: Record<string, string>): Promise<TokenResponse> {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl ?? "https://graph.facebook.com";
  const secrets = [config.appSecret, params.code ?? "", params.fb_exchange_token ?? ""];
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/${config.apiVersion}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, ...params }),
      cache: "no-store",
    });
  } catch (cause) {
    throw new MetaApiError({ message: redact(`Network error: ${(cause as Error)?.message ?? cause}`, secrets), kind: "transient" });
  }
  const body = (await response.json().catch(() => null)) as (TokenResponse & { error?: Record<string, unknown> }) | null;
  if (!response.ok || !body || body.error || typeof body.access_token !== "string") {
    const code = typeof body?.error?.code === "number" ? body.error.code : null;
    const message = typeof body?.error?.message === "string" ? body.error.message : `HTTP ${response.status}`;
    throw new MetaApiError({
      message: redact(message, secrets),
      kind: classifyMetaError(code, response.status),
      code,
      httpStatus: response.status,
    });
  }
  return body;
}

export interface TokenInfo {
  type: string | null;
  scopes: string[];
  /** Earliest of token expiry and data-access expiry; null when the token does not expire. */
  expiresAt: Date | null;
}

function epochToDate(value: unknown): Date | null {
  return typeof value === "number" && value > 0 ? new Date(value * 1000) : null;
}

/** Validates the token with the app access token and checks it was issued for this app. */
export async function inspectAccessToken(config: MetaOAuthConfig, token: string): Promise<TokenInfo> {
  const client = createGraphClient({
    accessToken: `${config.appId}|${config.appSecret}`,
    apiVersion: config.apiVersion,
    fetchImpl: config.fetchImpl,
    baseUrl: config.baseUrl,
    maxRetries: 1,
  });
  const { data } = await client.get<{ data?: Record<string, unknown> }>("debug_token", { input_token: token });
  if (!data || data.is_valid !== true) {
    throw new MetaApiError({ message: "Token refusé par Meta.", kind: "auth" });
  }
  if (String(data.app_id ?? "") !== config.appId) {
    throw new MetaApiError({ message: "Token émis pour une autre application Meta.", kind: "auth" });
  }
  const expiries = [epochToDate(data.expires_at), epochToDate(data.data_access_expires_at)].filter((d): d is Date => d !== null);
  return {
    type: typeof data.type === "string" ? data.type : null,
    scopes: Array.isArray(data.scopes) ? data.scopes.filter((s): s is string => typeof s === "string") : [],
    expiresAt: expiries.length ? new Date(Math.min(...expiries.map((d) => d.getTime()))) : null,
  };
}

/**
 * Exchanges the authorization code. Personal (USER) tokens are upgraded to
 * long-lived tokens; Business Login system-user tokens are kept as issued.
 */
export async function obtainAccessToken(
  config: MetaOAuthConfig,
  args: { code: string; redirectUri: string },
): Promise<{ accessToken: string; info: TokenInfo }> {
  const first = await postOAuth(config, { code: args.code, redirect_uri: args.redirectUri });
  let accessToken = first.access_token!;
  let info = await inspectAccessToken(config, accessToken);
  if (info.type === "USER" && info.expiresAt) {
    const longLived = await postOAuth(config, { grant_type: "fb_exchange_token", fb_exchange_token: accessToken });
    accessToken = longLived.access_token!;
    info = await inspectAccessToken(config, accessToken);
  }
  return { accessToken, info };
}
