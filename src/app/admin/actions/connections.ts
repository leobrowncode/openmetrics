"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { adAccounts, metaConnections } from "@/server/db/schema";
import { env } from "@/server/env";
import { describeMetaError, MetaApiError } from "@/server/meta/errors";
import { createMetaSource, fetchGrantedPermissions } from "@/server/meta/source";
import { decryptSecret, encryptSecret } from "@/server/security/encryption";
import { adminContext, formString, type ActionState } from "./context";

const WRITE_SCOPES = ["ads_management", "business_management"];

async function inspectToken(token: string) {
  const source = createMetaSource({
    accessToken: token,
    apiVersion: env().META_GRAPH_API_VERSION,
    appSecret: env().META_APP_SECRET,
    maxRetries: 1,
  });
  const scopes = await fetchGrantedPermissions(source.client);
  const accounts = scopes.includes("ads_read") || scopes.includes("ads_management") ? await source.listAdAccounts() : [];
  return { scopes, accounts };
}

function scopeMessage(scopes: string[], accountCount: number): string {
  const extra = scopes.filter((s) => WRITE_SCOPES.includes(s));
  const base = `Connexion vérifiée : ${accountCount} compte(s) publicitaire(s) accessible(s).`;
  return extra.length
    ? `${base} Attention : ce token dispose aussi de ${extra.join(", ")}. L'application n'effectue que des lectures, mais un token limité à ads_read est recommandé.`
    : base;
}

export async function createConnectionAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const label = formString(formData, "label");
  const token = formString(formData, "token");
  if (label.length < 2 || label.length > 120) return { error: "Nom de connexion invalide." };
  if (!/^[A-Za-z0-9_|-]{20,1000}$/.test(token)) return { error: "Le token ne semble pas valide." };

  try {
    const { scopes, accounts } = await inspectToken(token);
    if (!scopes.includes("ads_read") && !scopes.includes("ads_management")) {
      return { error: "Ce token n'a pas la permission ads_read : il ne peut pas lire les statistiques publicitaires." };
    }
    const [connection] = await db
      .insert(metaConnections)
      .values({
        label,
        kind: "meta",
        encryptedToken: encryptSecret(token),
        grantedScopes: scopes,
        status: "active",
        lastCheckedAt: new Date(),
      })
      .returning({ id: metaConnections.id });
    await log("connection.create", "meta_connection", connection.id, { scopes });
    revalidatePath("/admin/connections");
    return { ok: true, message: scopeMessage(scopes, accounts.length) };
  } catch (error) {
    return { error: error instanceof MetaApiError ? describeMetaError(error) : "Vérification du token impossible." };
  }
}

export async function testConnectionAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db } = await adminContext();
  const id = formString(formData, "connectionId");
  const [connection] = await db.select().from(metaConnections).where(eq(metaConnections.id, id));
  if (!connection) return { error: "Connexion introuvable." };
  if (connection.kind === "demo") return { ok: true, message: "Connexion de démonstration (données synthétiques)." };
  if (!connection.encryptedToken) return { error: "Aucun token enregistré." };

  try {
    const { scopes, accounts } = await inspectToken(decryptSecret(connection.encryptedToken));
    await db
      .update(metaConnections)
      .set({ status: "active", grantedScopes: scopes, lastCheckedAt: new Date(), lastError: null })
      .where(eq(metaConnections.id, id));
    revalidatePath("/admin/connections");
    return { ok: true, message: scopeMessage(scopes, accounts.length) };
  } catch (error) {
    const message = error instanceof MetaApiError ? describeMetaError(error) : "Vérification impossible.";
    const status =
      error instanceof MetaApiError && error.kind === "auth"
        ? "expired"
        : error instanceof MetaApiError && error.kind === "permission"
          ? "permission_denied"
          : "error";
    await db
      .update(metaConnections)
      .set({ status, lastError: message, lastCheckedAt: new Date() })
      .where(eq(metaConnections.id, id));
    revalidatePath("/admin/connections");
    return { error: message };
  }
}

export async function replaceTokenAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const id = formString(formData, "connectionId");
  const token = formString(formData, "token");
  if (!/^[A-Za-z0-9_|-]{20,1000}$/.test(token)) return { error: "Le token ne semble pas valide." };
  try {
    const { scopes, accounts } = await inspectToken(token);
    await db
      .update(metaConnections)
      .set({ encryptedToken: encryptSecret(token), grantedScopes: scopes, status: "active", lastError: null, lastCheckedAt: new Date() })
      .where(eq(metaConnections.id, id));
    await log("connection.replace_token", "meta_connection", id, { scopes });
    revalidatePath("/admin/connections");
    return { ok: true, message: scopeMessage(scopes, accounts.length) };
  } catch (error) {
    return { error: error instanceof MetaApiError ? describeMetaError(error) : "Vérification du token impossible." };
  }
}

export async function deleteConnectionAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const id = formString(formData, "connectionId");
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adAccounts)
    .where(eq(adAccounts.connectionId, id));
  if (count > 0) return;
  await db.delete(metaConnections).where(eq(metaConnections.id, id));
  await log("connection.delete", "meta_connection", id);
  revalidatePath("/admin/connections");
}
