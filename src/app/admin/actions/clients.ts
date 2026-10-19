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
  const [client] = await db.insert(clients).values({ name }).returning();
  await log("client.create", "client", client.id, { name });
  redirect(`/admin/clients/${client.id}`);
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

const addAccountSchema = z.object({
  clientId: z.string().min(1),
  connectionId: z.string().min(1),
  metaAccountId: z.string().regex(/^act_\d{1,20}$/, "Identifiant de compte invalide (format act_123…)."),
});

export async function addAdAccountAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const parsed = addAccountSchema.safeParse({
    clientId: formString(formData, "clientId"),
    connectionId: formString(formData, "connectionId"),
    metaAccountId: formString(formData, "metaAccountId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { clientId, connectionId, metaAccountId } = parsed.data;

  const [existing] = await db
    .select({ clientId: adAccounts.clientId, clientName: clients.name })
    .from(adAccounts)
    .innerJoin(clients, eq(clients.id, adAccounts.clientId))
    .where(eq(adAccounts.metaAccountId, metaAccountId));
  if (existing) {
    return { error: `Ce compte est déjà rattaché au client « ${existing.clientName} ». Un compte ne peut appartenir qu'à un seul client.` };
  }

  const [connection] = await db.select().from(metaConnections).where(eq(metaConnections.id, connectionId));
  if (!connection) return { error: "Connexion introuvable." };

  let info;
  try {
    info = await defaultSourceFactory(connection).getAdAccount(metaAccountId);
  } catch (error) {
    return { error: error instanceof MetaApiError ? describeMetaError(error) : "Impossible de lire ce compte chez Meta." };
  }

  const [account] = await db
    .insert(adAccounts)
    .values({
      clientId,
      connectionId,
      metaAccountId,
      name: info.name,
      currency: info.currency,
      timezoneName: info.timezoneName,
    })
    .returning();
  await log("ad_account.add", "ad_account", account.id, { metaAccountId, clientId });

  after(() => syncAdAccount(db, account.id, { trigger: "backfill" }));
  revalidatePath(`/admin/clients/${clientId}`);
  return {
    ok: true,
    message: `Compte « ${info.name} » ajouté. L'historique (13 mois) est en cours d'import. Configurez ensuite le type de conversion.`,
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
