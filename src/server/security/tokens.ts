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
export function hashToken(token: string, purpose: "share" | "session"): string {
  return createHmac("sha256", requireSecret("TOKEN_HASH_SECRET"))
    .update(`${purpose}:${token}`)
    .digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
