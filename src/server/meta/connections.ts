import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { metaConnections } from "../db/schema";
import { env } from "../env";
import { encryptSecret } from "../security/encryption";
import { inspectAccessToken, type MetaOAuthConfig } from "./oauth";
import { createMetaSource, fetchGrantedPermissions } from "./source";

const WRITE_SCOPES = ["ads_management", "business_management"];

export function metaOAuthConfig(): MetaOAuthConfig | null {
  const { META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID, META_GRAPH_API_VERSION } = env();
  if (!META_APP_ID || !META_APP_SECRET) return null;
  return { appId: META_APP_ID, appSecret: META_APP_SECRET, configId: META_LOGIN_CONFIG_ID, apiVersion: META_GRAPH_API_VERSION };
}

export async function inspectToken(token: string, fetchImpl?: typeof fetch) {
  const source = createMetaSource({
    accessToken: token,
    apiVersion: env().META_GRAPH_API_VERSION,
    appSecret: env().META_APP_SECRET,
    maxRetries: 1,
    fetchImpl,
  });
  const scopes = await fetchGrantedPermissions(source.client);
  const canRead = scopes.includes("ads_read") || scopes.includes("ads_management");
  const accounts = canRead ? await source.listAdAccounts() : [];
  return { scopes, accounts, canRead };
}

export async function tokenOwnerName(token: string): Promise<string | null> {
  const { client } = createMetaSource({ accessToken: token, apiVersion: env().META_GRAPH_API_VERSION, appSecret: env().META_APP_SECRET, maxRetries: 1 });
  try {
    const me = await client.get<{ name?: string }>("me", { fields: "name" });
    return typeof me.name === "string" ? me.name.slice(0, 100) : null;
  } catch {
    return null;
  }
}

export function scopeMessage(scopes: string[], accountCount: number): string {
  const extra = scopes.filter((s) => WRITE_SCOPES.includes(s));
  const base = `Connexion vérifiée : ${accountCount} compte(s) publicitaire(s) accessible(s).`;
  return extra.length
    ? `${base} Attention : ce token dispose aussi de ${extra.join(", ")}. L'application n'effectue que des lectures, mais un token limité à ads_read est recommandé.`
    : base;
}

/** Expiry of a pasted token, when it was issued by the configured Meta app. */
export async function pastedTokenExpiry(token: string): Promise<Date | null> {
  const config = metaOAuthConfig();
  if (!config) return null;
  try {
    return (await inspectAccessToken(config, token)).expiresAt;
  } catch {
    return null;
  }
}

/** Inserts a new connection, or replaces the token of an existing one. */
export async function saveMetaConnection(
  db: Db,
  args: { connectionId?: string | null; label: string; token: string; scopes: string[]; expiresAt: Date | null },
): Promise<string> {
  const values = {
    encryptedToken: encryptSecret(args.token),
    grantedScopes: args.scopes,
    tokenExpiresAt: args.expiresAt,
    status: "active" as const,
    lastError: null,
    lastCheckedAt: new Date(),
  };
  if (args.connectionId) {
    const [row] = await db
      .update(metaConnections)
      .set(values)
      .where(and(eq(metaConnections.id, args.connectionId), eq(metaConnections.kind, "meta")))
      .returning({ id: metaConnections.id });
    if (!row) throw new Error("Connexion introuvable.");
    return row.id;
  }
  const [row] = await db
    .insert(metaConnections)
    .values({ label: args.label, kind: "meta", ...values })
    .returning({ id: metaConnections.id });
  return row.id;
}
