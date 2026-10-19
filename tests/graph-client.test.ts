import { describe, expect, it, vi } from "vitest";
import { MetaApiError } from "@/server/meta/errors";
import { createGraphClient } from "@/server/meta/graph-client";
import { createMetaSource } from "@/server/meta/source";

const TOKEN = "EAAB-secret-token-value-123";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function mockFetch(responses: Array<Response | Error>) {
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const fn = vi.fn(async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("unexpected call");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const noSleep = async () => {};

describe("Graph API client", () => {
  it("only issues GET requests and sends the token in a header, never in the URL", async () => {
    const { fn, calls } = mockFetch([jsonResponse({ id: "act_1" })]);
    const client = createGraphClient({ accessToken: TOKEN, apiVersion: "v24.0", fetchImpl: fn, sleep: noSleep });
    await client.get("act_1", { fields: "name" });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url.toString()).not.toContain(TOKEN);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].url.pathname).toBe("/v24.0/act_1");
  });

  it("exposes no write method", () => {
    const client = createGraphClient({ accessToken: TOKEN, apiVersion: "v24.0" }) as unknown as Record<string, unknown>;
    for (const method of ["post", "put", "patch", "delete", "request"]) {
      expect(client[method]).toBeUndefined();
    }
  });

  it("refuses token or path injection", async () => {
    const client = createGraphClient({ accessToken: TOKEN, apiVersion: "v24.0", fetchImpl: mockFetch([]).fn });
    await expect(client.get("act_1?method=post")).rejects.toThrow(/Invalid Graph API path/);
    await expect(client.get("../act_1")).rejects.toThrow(/Invalid Graph API path/);
    await expect(client.get("act_1", { access_token: "x" })).rejects.toThrow(/token/);
  });

  it("adds appsecret_proof when an app secret is configured", async () => {
    const { fn, calls } = mockFetch([jsonResponse({})]);
    const client = createGraphClient({ accessToken: TOKEN, apiVersion: "v24.0", appSecret: "s3cr3t", fetchImpl: fn });
    await client.get("me");
    expect(calls[0].url.searchParams.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("follows cursor pagination", async () => {
    const { fn, calls } = mockFetch([
      jsonResponse({ data: [{ n: 1 }, { n: 2 }], paging: { cursors: { after: "c1" }, next: `https://graph.facebook.com/x?access_token=${TOKEN}` } }),
      jsonResponse({ data: [{ n: 3 }], paging: { cursors: { after: "c2" } } }),
    ]);
    const client = createGraphClient({ accessToken: TOKEN, apiVersion: "v24.0", fetchImpl: fn, sleep: noSleep });
    const rows = await client.getAll<{ n: number }>("act_1/insights", { limit: 2 });
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3]);
    expect(calls[1].url.searchParams.get("after")).toBe("c1");
    expect(calls[1].url.toString()).not.toContain(TOKEN);
  });

  it("retries transient and throttling errors with backoff", async () => {
    const sleep = vi.fn(noSleep);
    const { fn } = mockFetch([
      jsonResponse({ error: { code: 2, message: "Service temporarily unavailable" } }, 500),
      jsonResponse({ error: { code: 80000, message: "Too many calls" } }, 400),
      jsonResponse({ ok: true }),
    ]);
    const client = createGraphClient({ accessToken: TOKEN, apiVersion: "v24.0", fetchImpl: fn, sleep });
    await expect(client.get("me")).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(client.callCount).toBe(3);
  });

  it("does not retry auth errors, classifies them and redacts the token", async () => {
    const { fn } = mockFetch([
      jsonResponse({ error: { code: 190, error_subcode: 463, message: `Session has expired for ${TOKEN}` } }, 400),
    ]);
    const client = createGraphClient({ accessToken: TOKEN, apiVersion: "v24.0", fetchImpl: fn, sleep: noSleep });
    const error = (await client.get("me").catch((e) => e)) as MetaApiError;
    expect(error).toBeInstanceOf(MetaApiError);
    expect(error.kind).toBe("auth");
    expect(error.message).not.toContain(TOKEN);
    expect(client.callCount).toBe(1);
  });

  it("gives up when Meta asks to wait too long", async () => {
    const usage = JSON.stringify({ "123": [{ type: "ads_insights", estimated_time_to_regain_access: 30 }] });
    const { fn } = mockFetch([
      jsonResponse({ error: { code: 17, message: "User request limit reached" } }, 400, { "x-business-use-case-usage": usage }),
    ]);
    const client = createGraphClient({ accessToken: TOKEN, apiVersion: "v24.0", fetchImpl: fn, sleep: noSleep });
    const error = (await client.get("me").catch((e) => e)) as MetaApiError;
    expect(error.kind).toBe("rate_limit");
    expect(error.retryAfterMs).toBe(30 * 60_000);
  });

  it("requests daily campaign insights without overriding attribution", async () => {
    const { fn, calls } = mockFetch([jsonResponse({ data: [] })]);
    const source = createMetaSource({ accessToken: TOKEN, apiVersion: "v24.0", fetchImpl: fn });
    await source.fetchCampaignDailyInsights("act_123", { from: "2026-10-01", to: "2026-10-31" });
    const params = calls[0].url.searchParams;
    expect(calls[0].url.pathname).toBe("/v24.0/act_123/insights");
    expect(params.get("level")).toBe("campaign");
    expect(params.get("time_increment")).toBe("1");
    expect(JSON.parse(params.get("time_range")!)).toEqual({ since: "2026-10-01", until: "2026-10-31" });
    expect(params.get("action_attribution_windows")).toBeNull();
    await expect(source.fetchCampaignDailyInsights("123; drop", { from: "2026-10-01", to: "2026-10-01" })).rejects.toThrow();
  });
});
