import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireSecret } from "../env";

/** 256-bit cryptographically random token, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/**
 * Keyed fingerprint stored instead of the raw token. A database leak alone does
 * not allow recomputing valid tokens without TOKEN_HASH_SECRET.
 */
export function hashToken(token: string, purpose: "share" | "session" | "oauth"): string {
  return createHmac("sha256", requireSecret("TOKEN_HASH_SECRET"))
    .update(`${purpose}:${token}`)
    .digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Tamper-evident value for short-lived cookies: base64url(JSON).hmac */
export function signPayload(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hashToken(body, "oauth")}`;
}

export function verifySignedPayload<T>(value: unknown): T | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  const [body, mac, ...rest] = value.split(".");
  if (!body || !mac || rest.length > 0 || !safeEqual(mac, hashToken(body, "oauth"))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
