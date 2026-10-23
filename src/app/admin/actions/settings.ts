"use server";

import { revalidatePath } from "next/cache";
import { isSyntheticDisplay } from "@/lib/synthetic-display";
import { setSyntheticDisplay } from "@/server/settings/synthetic";
import { purgeSyntheticDataIfReady } from "@/server/settings/synthetic-purge";
import { adminContext, formString, type ActionState } from "./context";

export async function setSyntheticDisplayAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const display = formString(formData, "syntheticDisplay");
  if (!isSyntheticDisplay(display)) return { error: "Choix d'affichage invalide." };
  await setSyntheticDisplay(db, display);
  const purged = await purgeSyntheticDataIfReady(db);
  await log("settings.synthetic_display", "site_settings", "default", { display, purged });
  for (const path of ["/", "/admin", "/admin/clients", "/admin/dashboards", "/admin/connections", "/admin/syncs"]) {
    revalidatePath(path);
  }
  revalidatePath("/demo", "layout");
  return {
    ok: true,
    message: purged
      ? `Affichage enregistré. ${purged.clients} client(s) synthétique(s) effacé(s).`
      : "Affichage des données synthétiques enregistré.",
  };
}
