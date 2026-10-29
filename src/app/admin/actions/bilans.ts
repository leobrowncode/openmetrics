"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createBilan, deleteBilan } from "@/server/dashboards/bilans";
import { adminContext, formString, type ActionState } from "./context";

export async function createBilanAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const dashboardId = formString(formData, "dashboardId");
  const name = formString(formData, "name");
  const campaignIds = formData.getAll("campaignIds").filter((v): v is string => typeof v === "string");
  const range = { from: formString(formData, "from"), to: formString(formData, "to") };
  const result = await createBilan(db, { dashboardId, name, campaignIds, range });
  if ("error" in result) return { error: result.error };
  await log("bilan.create", "bilan", result.id, { dashboardId, campaignIds, range });
  revalidatePath(`/admin/dashboards/${dashboardId}/bilans`);
  redirect(`/admin/dashboards/${dashboardId}/bilans/${result.id}`);
}

export async function deleteBilanAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const dashboardId = formString(formData, "dashboardId");
  const bilanId = formString(formData, "bilanId");
  await deleteBilan(db, dashboardId, bilanId);
  await log("bilan.delete", "bilan", bilanId, { dashboardId });
  revalidatePath(`/admin/dashboards/${dashboardId}/bilans`);
  redirect(`/admin/dashboards/${dashboardId}/bilans`);
}
