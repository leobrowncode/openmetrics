"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { adAccounts, metaConnections } from "@/server/db/schema";
import { inspectToken, pastedTokenExpiry, saveMetaConnection, scopeMessage } from "@/server/meta/connections";
import { describeMetaError, MetaApiError } from "@/server/meta/errors";
import { decryptSecret } from "@/server/security/encryption";
import { adminContext, formString, type ActionState } from "./context";

const TOKEN_RE = /^[A-Za-z0-9_|-]{20,1000}$/;
const NO_READ_PERMISSION = "Ce token n'a pas la permission ads_read : il ne peut pas lire les statistiques publicitaires.";

export async function createConnectionAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const label = formString(formData, "label");
  const token = formString(formData, "token");
  if (label.length < 2 || label.length > 120) return { error: "Nom de connexion invalide." };
  if (!TOKEN_RE.test(token)) return { error: "Le token ne semble pas valide." };

  try {
    const { scopes, accounts, canRead } = await inspectToken(token);
    if (!canRead) return { error: NO_READ_PERMISSION };
    const id = await saveMetaConnection(db, { label, token, scopes, expiresAt: await pastedTokenExpiry(token) });
    await log("connection.create", "meta_connection", id, { scopes, method: "token" });
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
  if (!TOKEN_RE.test(token)) return { error: "Le token ne semble pas valide." };
  try {
    const { scopes, accounts, canRead } = await inspectToken(token);
    if (!canRead) return { error: NO_READ_PERMISSION };
    await saveMetaConnection(db, { connectionId: id, label: "", token, scopes, expiresAt: await pastedTokenExpiry(token) });
    await log("connection.replace_token", "meta_connection", id, { scopes, method: "token" });
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
