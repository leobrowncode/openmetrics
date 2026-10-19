"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { adAccounts } from "@/server/db/schema";
import { syncAdAccount } from "@/server/sync/sync-service";
import { adminContext, formString, type ActionState } from "./context";

export async function syncNowAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const accountId = formString(formData, "accountId");
  const [account] = await db.select().from(adAccounts).where(eq(adAccounts.id, accountId));
  if (!account) return { error: "Compte introuvable." };
  const result = await syncAdAccount(db, accountId, { trigger: "manual" });
  await log("sync.manual", "ad_account", accountId, { status: result.status });
  revalidatePath("/admin/syncs");
  revalidatePath(`/admin/clients/${account.clientId}`);
  if (result.status === "skipped") return { error: "Une synchronisation est déjà en cours pour ce compte." };
  if (result.status === "error") return { error: result.errorMessage };
  return { ok: true, message: `Synchronisé : ${result.rowsWritten} lignes (${result.range?.from} → ${result.range?.to}).` };
}
