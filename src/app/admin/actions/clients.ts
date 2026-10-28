"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adAccounts, clients, metaConnections } from "@/server/db/schema";
import { findOverlappingActionTypes } from "@/server/sync/normalize";
import { defaultSourceFactory, recomputeConversions, syncAdAccount } from "@/server/sync/sync-service";
import { describeMetaError, MetaApiError } from "@/server/meta/errors";
import { adminContext, formString, type ActionState } from "./context";

export async function createClientAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const name = formString(formData, "name");
  if (name.length < 2 || name.length > 120) return { error: "Nom du client invalide (2 à 120 caractères)." };

  const metaAccountId = formString(formData, "metaAccountId");
  const connectionId = formString(formData, "connectionId");
  let pending: ResolvedAdAccount | null = null;
  if (metaAccountId || connectionId) {
    const resolved = await resolveAdAccount(db, connectionId, metaAccountId);
    if ("error" in resolved) return { error: resolved.error };
    pending = resolved;
  }

  let clientId: string;
  let accountId: string | null = null;
  try {
    const inserted = await db.transaction(async (tx) => {
      const [client] = await tx.insert(clients).values({ name }).returning();
      if (!pending) return { clientId: client.id, accountId: null as string | null };
      const [account] = await tx
        .insert(adAccounts)
        .values({
          clientId: client.id,
          connectionId: pending.connection.id,
          metaAccountId: pending.info.metaAccountId,
          name: pending.info.name,
          currency: pending.info.currency,
          timezoneName: pending.info.timezoneName,
        })
        .returning();
      return { clientId: client.id, accountId: account.id };
    });
    clientId = inserted.clientId;
    accountId = inserted.accountId;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ce compte est déjà rattaché à un client. Un compte ne peut appartenir qu'à un seul client." };
    }
    throw error;
  }

  await log("client.create", "client", clientId, { name });
  if (accountId && pending) {
    await log("ad_account.add", "ad_account", accountId, { metaAccountId: pending.info.metaAccountId, clientId });
    const syncedAccountId = accountId;
    after(() => syncAdAccount(db, syncedAccountId, { trigger: "backfill" }));
  }
  redirect(`/admin/clients/${clientId}`);
}

export async function renameClientAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const id = formString(formData, "clientId");
  const name = formString(formData, "name");
  if (name.length < 2 || name.length > 120) return;
  await db.update(clients).set({ name }).where(eq(clients.id, id));
  await log("client.rename", "client", id, { name });
  revalidatePath(`/admin/clients/${id}`);
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const id = formString(formData, "clientId");
  if (formString(formData, "confirm") !== "SUPPRIMER") return;
  await db.delete(clients).where(eq(clients.id, id));
  await log("client.delete", "client", id);
  redirect("/admin/clients");
}

const accountChoiceSchema = z.object({
  connectionId: z.string().min(1, "Choisissez un compte publicitaire."),
  metaAccountId: z.string().regex(/^act_\d{1,20}$/, "Identifiant de compte invalide (format act_123…)."),
});

type ResolvedAdAccount = {
  connection: typeof metaConnections.$inferSelect;
  info: Awaited<ReturnType<ReturnType<typeof defaultSourceFactory>["getAdAccount"]>>;
};

async function resolveAdAccount(
  db: Awaited<ReturnType<typeof adminContext>>["db"],
  connectionId: string,
  metaAccountId: string,
): Promise<{ error: string } | ResolvedAdAccount> {
  if (!metaAccountId) return { error: "Choisissez un compte publicitaire." };
  const parsed = accountChoiceSchema.safeParse({ connectionId, metaAccountId });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };

  const [existing] = await db
    .select({ clientName: clients.name })
    .from(adAccounts)
    .innerJoin(clients, eq(clients.id, adAccounts.clientId))
    .where(eq(adAccounts.metaAccountId, parsed.data.metaAccountId));
  if (existing) {
    return { error: `Ce compte est déjà rattaché au client « ${existing.clientName} ». Un compte ne peut appartenir qu'à un seul client.` };
  }

  const [connection] = await db.select().from(metaConnections).where(eq(metaConnections.id, parsed.data.connectionId));
  if (!connection) return { error: "Connexion introuvable." };

  try {
    const info = await defaultSourceFactory(connection).getAdAccount(parsed.data.metaAccountId);
    return { connection, info };
  } catch (error) {
    return { error: error instanceof MetaApiError ? describeMetaError(error) : "Impossible de lire ce compte chez Meta." };
  }
}

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (record.code === "23505") return true;
    if (typeof record.message === "string" && record.message.includes("ad_accounts_meta_account_uidx")) return true;
    current = record.cause;
  }
  return false;
}

export async function addAdAccountAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const clientId = formString(formData, "clientId");
  if (!clientId) return { error: "Client introuvable." };
  const resolved = await resolveAdAccount(db, formString(formData, "connectionId"), formString(formData, "metaAccountId"));
  if ("error" in resolved) return { error: resolved.error };
  const { connection, info } = resolved;

  let accountId: string;
  try {
    const [account] = await db
      .insert(adAccounts)
      .values({
        clientId,
        connectionId: connection.id,
        metaAccountId: info.metaAccountId,
        name: info.name,
        currency: info.currency,
        timezoneName: info.timezoneName,
      })
      .returning();
    accountId = account.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ce compte est déjà rattaché à un client. Un compte ne peut appartenir qu'à un seul client." };
    }
    throw error;
  }
  await log("ad_account.add", "ad_account", accountId, { metaAccountId: info.metaAccountId, clientId });

  after(() => syncAdAccount(db, accountId, { trigger: "backfill" }));
  revalidatePath(`/admin/clients/${clientId}`);
  return {
    ok: true,
    message: `Compte « ${info.name} » ajouté. L'historique (25 mois) est en cours d'import, des données les plus récentes aux plus anciennes. Configurez ensuite le type de conversion.`,
  };
}

export async function setAccountActiveAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const accountId = formString(formData, "accountId");
  const active = formString(formData, "active") === "true";
  const [account] = await db.update(adAccounts).set({ isActive: active }).where(eq(adAccounts.id, accountId)).returning();
  await log(active ? "ad_account.activate" : "ad_account.deactivate", "ad_account", accountId);
  if (account) revalidatePath(`/admin/clients/${account.clientId}`);
}

export async function removeAdAccountAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const accountId = formString(formData, "accountId");
  const clientId = formString(formData, "clientId");
  await db.delete(adAccounts).where(and(eq(adAccounts.id, accountId), eq(adAccounts.clientId, clientId)));
  await log("ad_account.remove", "ad_account", accountId);
  revalidatePath(`/admin/clients/${clientId}`);
}

const ACTION_TYPE_RE = /^[a-z0-9_.]{1,120}$/i;

export async function setConversionTypesAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const accountId = formString(formData, "accountId");
  const selected = formData
    .getAll("actionTypes")
    .filter((v): v is string => typeof v === "string" && ACTION_TYPE_RE.test(v));
  const custom = formString(formData, "customActionType");
  if (custom) {
    if (!ACTION_TYPE_RE.test(custom)) return { error: "Type d'action personnalisé invalide." };
    selected.push(custom);
  }
  const types = [...new Set(selected)];
  const overlaps = findOverlappingActionTypes(types);
  if (overlaps.length) {
    return {
      error: `Ces types désignent le même événement et doubleraient les conversions : ${overlaps.map((o) => `${o.label} (${o.types.join(", ")})`).join(" ; ")}. Gardez-en un seul.`,
    };
  }
  const [account] = await db.update(adAccounts).set({ conversionActionTypes: types }).where(eq(adAccounts.id, accountId)).returning();
  if (!account) return { error: "Compte introuvable." };
  await recomputeConversions(db, accountId, types);
  await log("ad_account.conversion_types", "ad_account", accountId, { types });
  revalidatePath(`/admin/clients/${account.clientId}`);
  return { ok: true, message: types.length ? "Conversions recalculées sur tout l'historique." : "Aucune conversion ne sera comptée." };
}
