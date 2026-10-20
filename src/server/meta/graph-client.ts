import { createHmac } from "node:crypto";
import { classifyMetaError, MetaApiError } from "./errors";

/**
 * Minimal Graph API client. It intentionally exposes GET requests only: the
 * application must never be able to modify campaigns, ad sets, ads or budgets,
 * whatever permissions the configured token carries.
 */

export interface GraphClientOptions {
  accessToken: string;
  apiVersion: string;
  appSecret?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
}

export type GraphParams = Record<string, string | number | boolean | object | undefined>;

export interface GraphPage<T> {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export interface GraphClient {
  get<T = unknown>(path: string, params?: GraphParams): Promise<T>;
  getAll<T = unknown>(path: string, params?: GraphParams, maxPages?: number): Promise<T[]>;
  readonly callCount: number;
}

const PATH_RE = /^\/?[A-Za-z0-9_]+(\/[A-Za-z0-9_]+)*$/;
const MAX_RATE_LIMIT_WAIT_MS = 120_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function redact(text: string, secrets: string[]): string {
  let out = text.replace(/access_token=[^&\s"]+/gi, "access_token=[redacted]");
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

/** Parses Meta usage headers and returns the advertised wait time, if any. */
export function parseRetryAfterMs(headers: Headers): number | null {
  const raw = headers.get("x-business-use-case-usage");
  if (!raw) return null;
  try {
    const usage = JSON.parse(raw) as Record<string, Array<{ estimated_time_to_regain_access?: number }>>;
    let minutes = 0;
    for (const entries of Object.values(usage)) {
      for (const entry of entries) {
        minutes = Math.max(minutes, entry.estimated_time_to_regain_access ?? 0);
      }
    }
    return minutes > 0 ? minutes * 60_000 : null;
  } catch {
    return null;
  }
}

export function createGraphClient(options: GraphClientOptions): GraphClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 3;
  const baseUrl = options.baseUrl ?? "https://graph.facebook.com";
  const secrets = [options.accessToken, options.appSecret ?? ""];
  const proof = options.appSecret
    ? createHmac("sha256", options.appSecret).update(options.accessToken).digest("hex")
    : null;
  let callCount = 0;

  function buildUrl(path: string, params: GraphParams): URL {
    if (!PATH_RE.test(path)) throw new Error(`Invalid Graph API path: ${path}`);
    const url = new URL(`${baseUrl}/${options.apiVersion}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      if (key === "access_token") throw new Error("Pass the token through options, not params.");
      url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    if (proof) url.searchParams.set("appsecret_proof", proof);
    return url;
  }

  async function requestOnce<T>(url: URL): Promise<T> {
    callCount += 1;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${options.accessToken}`, Accept: "application/json" },
        cache: "no-store",
      });
    } catch (cause) {
      throw new MetaApiError({
        message: redact(`Network error: ${(cause as Error)?.message ?? cause}`, secrets),
        kind: "transient",
      });
    }

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    const err = (body as { error?: Record<string, unknown> } | null)?.error;
    if (!response.ok || err) {
      const code = typeof err?.code === "number" ? err.code : null;
      const subcode = typeof err?.error_subcode === "number" ? err.error_subcode : null;
      const message =
        (typeof err?.error_user_msg === "string" && err.error_user_msg) ||
        (typeof err?.message === "string" && err.message) ||
        `HTTP ${response.status}`;
      throw new MetaApiError({
        message: redact(message, secrets),
        kind: classifyMetaError(code, response.status),
        code,
        subcode,
        httpStatus: response.status,
        retryAfterMs: parseRetryAfterMs(response.headers),
        fbtraceId: typeof err?.fbtrace_id === "string" ? err.fbtrace_id : null,
      });
    }
    if (body === null) {
      throw new MetaApiError({ message: "Empty or non-JSON response", kind: "transient", httpStatus: response.status });
    }
    return body as T;
  }

  async function get<T>(path: string, params: GraphParams = {}): Promise<T> {
    const url = buildUrl(path, params);
    for (let attempt = 0; ; attempt++) {
      try {
        return await requestOnce<T>(url);
      } catch (error) {
        if (!(error instanceof MetaApiError) || !error.retryable || attempt >= maxRetries) throw error;
        const backoff = 2 ** attempt * 1000 + Math.floor(Math.random() * 250);
        const wait = Math.max(backoff, error.retryAfterMs ?? 0);
        if (wait > MAX_RATE_LIMIT_WAIT_MS) throw error;
        await sleep(wait);
      }
    }
  }

  async function getAll<T>(path: string, params: GraphParams = {}, maxPages = 200): Promise<T[]> {
    const rows: T[] = [];
    let after: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const result = await get<GraphPage<T>>(path, { ...params, after });
      rows.push(...(result.data ?? []));
      after = result.paging?.cursors?.after;
      if (!result.paging?.next || !after) return rows;
    }
    throw new MetaApiError({
      message: `Pagination exceeded ${maxPages} pages for ${path}`,
      kind: "invalid_request",
    });
  }

  return {
    get,
    getAll,
    get callCount() {
      return callCount;
    },
  };
}
