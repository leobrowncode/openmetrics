import { describe, expect, it } from "vitest";
import { MetaApiError } from "@/server/meta/errors";
import { buildAuthorizeUrl, obtainAccessToken, type MetaOAuthConfig } from "@/server/meta/oauth";
import { signPayload, verifySignedPayload } from "@/server/security/tokens";

const APP_SECRET = "super-secret-app-secret-value";
const now = Math.floor(Date.now() / 1000);

interface Call {
  url: string;
  method: string;
  body: string;
  auth: string | null;
}

function fakeMeta(debug: Record<string, Record<string, unknown>>, failExchange = false) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? "GET", body: String(init?.body ?? ""), auth: headers.get("authorization") });
    if (url.includes("/oauth/access_token")) {
      if (failExchange) {
        return Response.json({ error: { message: `Invalid client_secret ${APP_SECRET}`, code: 100 } }, { status: 400 });
      }
      const params = new URLSearchParams(String(init?.body));
      const token = params.get("grant_type") === "fb_exchange_token" ? "LONG_LIVED_TOKEN_123456" : "SHORT_TOKEN_1234567890";
      return Response.json({ access_token: token, token_type: "bearer" });
    }
    if (url.includes("/debug_token")) {
      const input = new URL(url).searchParams.get("input_token")!;
      return Response.json({ data: debug[input] ?? { is_valid: false } });
    }
    return Response.json({ error: { message: "unexpected", code: 1 } }, { status: 500 });
  }) as typeof fetch;
  const config: MetaOAuthConfig = { appId: "1234567890", appSecret: APP_SECRET, apiVersion: "v24.0", fetchImpl };
  return { calls, config };
}

describe("Meta OAuth", () => {
  it("requests ads_read only and never puts the app secret in the dialog URL", () => {
    const { config } = fakeMeta({});
    const url = new URL(buildAuthorizeUrl(config, { redirectUri: "https://app.example/admin/connections/meta/callback", state: "s".repeat(43) }));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.searchParams.get("scope")).toBe("ads_read");
    expect(url.searchParams.get("state")).toBe("s".repeat(43));
    expect(url.toString()).not.toContain(APP_SECRET);

    const business = new URL(buildAuthorizeUrl({ ...config, configId: "998877" }, { redirectUri: "https://x/cb", state: "abc" }));
    expect(business.searchParams.get("config_id")).toBe("998877");
    expect(business.searchParams.has("scope")).toBe(false);
  });

  it("upgrades a personal token to a long-lived one and keeps the earliest expiry", async () => {
    const { calls, config } = fakeMeta({
      SHORT_TOKEN_1234567890: { is_valid: true, app_id: "1234567890", type: "USER", expires_at: now + 3600, scopes: ["ads_read"] },
      LONG_LIVED_TOKEN_123456: {
        is_valid: true,
        app_id: "1234567890",
        type: "USER",
        expires_at: now + 60 * 86400,
        data_access_expires_at: now + 30 * 86400,
        scopes: ["ads_read"],
      },
    });
    const { accessToken, info } = await obtainAccessToken(config, { code: "AQ-code-value", redirectUri: "https://x/cb" });
    expect(accessToken).toBe("LONG_LIVED_TOKEN_123456");
    expect(info.expiresAt?.getTime()).toBe((now + 30 * 86400) * 1000);

    const exchanges = calls.filter((c) => c.url.includes("/oauth/access_token"));
    expect(exchanges).toHaveLength(2);
    for (const call of exchanges) {
      expect(call.method).toBe("POST");
      expect(call.url).not.toContain(APP_SECRET);
    }
    for (const call of calls.filter((c) => c.url.includes("/debug_token"))) {
      expect(call.url).not.toContain(APP_SECRET);
      expect(call.auth).toBe(`Bearer 1234567890|${APP_SECRET}`);
    }
  });

  it("keeps non-expiring system-user tokens as issued", async () => {
    const { calls, config } = fakeMeta({
      SHORT_TOKEN_1234567890: { is_valid: true, app_id: "1234567890", type: "SYSTEM_USER", expires_at: 0, scopes: ["ads_read"] },
    });
    const { accessToken, info } = await obtainAccessToken(config, { code: "AQ-code-value", redirectUri: "https://x/cb" });
    expect(accessToken).toBe("SHORT_TOKEN_1234567890");
    expect(info.expiresAt).toBeNull();
    expect(info.type).toBe("SYSTEM_USER");
    expect(calls.filter((c) => c.url.includes("/oauth/access_token"))).toHaveLength(1);
  });

  it("rejects tokens issued for another app", async () => {
    const { config } = fakeMeta({
      SHORT_TOKEN_1234567890: { is_valid: true, app_id: "999", type: "SYSTEM_USER", expires_at: 0 },
    });
    await expect(obtainAccessToken(config, { code: "AQ-code-value", redirectUri: "https://x/cb" })).rejects.toMatchObject({ kind: "auth" });
  });

  it("redacts the app secret from Meta error messages", async () => {
    const { config } = fakeMeta({}, true);
    const error = (await obtainAccessToken(config, { code: "AQ-code-value", redirectUri: "https://x/cb" }).catch((e) => e)) as MetaApiError;
    expect(error).toBeInstanceOf(MetaApiError);
    expect(error.message).not.toContain(APP_SECRET);
  });
});

describe("signed OAuth state cookie", () => {
  it("round-trips and rejects tampering", () => {
    const value = signPayload({ s: "state", u: "admin-1", c: null, x: 1 });
    expect(verifySignedPayload(value)).toEqual({ s: "state", u: "admin-1", c: null, x: 1 });

    const [body, mac] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ s: "state", u: "attacker", c: null, x: 1 })).toString("base64url");
    expect(verifySignedPayload(`${forged}.${mac}`)).toBeNull();
    expect(verifySignedPayload(`${body}.${"0".repeat(64)}`)).toBeNull();
    expect(verifySignedPayload(`${body}`)).toBeNull();
    expect(verifySignedPayload(undefined)).toBeNull();
  });
});
