"use server";

import { revalidatePath } from "next/cache";
import { isSyntheticDisplay } from "@/lib/synthetic-display";
import { setSyntheticDisplay } from "@/server/settings/synthetic";
import { adminContext, formString, type ActionState } from "./context";

export async function setSyntheticDisplayAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const display = formString(formData, "syntheticDisplay");
  if (!isSyntheticDisplay(display)) return { error: "Choix d'affichage invalide." };
  await setSyntheticDisplay(db, display);
  await log("settings.synthetic_display", "site_settings", "default", { display });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/connections");
  revalidatePath("/demo", "layout");
  return { ok: true, message: "Affichage des données synthétiques enregistré." };
}
