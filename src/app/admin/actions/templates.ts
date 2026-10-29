"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CHART_STYLES,
  REFERENCE_TEMPLATE_CONFIG,
  WIDGET_TYPES,
  blankDashboardConfig,
  dashboardConfigSchema,
  newId,
  parseDashboardConfig,
  type DashboardConfig,
} from "@/lib/dashboard-config";
import { addSection, addWidget, deleteSection, deleteWidget, moveSection, moveWidget, renameSection } from "@/lib/dashboard-structure";
import { isMetricKey } from "@/lib/metrics";
import { isPeriodPreset } from "@/lib/periods";
import { dashboardTemplates } from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import { adminContext, formString, type ActionState } from "./context";

async function loadTemplate(db: Db, id: string) {
  const [template] = await db.select().from(dashboardTemplates).where(eq(dashboardTemplates.id, id));
  if (!template) throw new Error("Modèle introuvable.");
  return template;
}

async function mutateTemplate(formData: FormData, mutate: (config: DashboardConfig) => void | boolean): Promise<boolean> {
  const { db, log } = await adminContext();
  const id = formString(formData, "templateId");
  const template = await loadTemplate(db, id);
  const config = parseDashboardConfig(template.config);
  if (mutate(config) === false) return false;
  await db.update(dashboardTemplates).set({ config: dashboardConfigSchema.parse(config) }).where(eq(dashboardTemplates.id, id));
  await log("template.update", "template", id);
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${id}`);
  return true;
}

export async function createTemplateAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const name = formString(formData, "name");
  const description = formString(formData, "description").slice(0, 300);
  if (name.length < 2 || name.length > 120) return { error: "Nom du modèle invalide (2 à 120 caractères)." };
  const config = formString(formData, "base") === "blank" ? blankDashboardConfig() : parseDashboardConfig(structuredClone(REFERENCE_TEMPLATE_CONFIG));
  const [template] = await db
    .insert(dashboardTemplates)
    .values({ name, description: description || null, config, builtIn: false })
    .returning();
  await log("template.create", "template", template.id, { base: formString(formData, "base") || "reference" });
  redirect(`/admin/templates/${template.id}`);
}

export async function updateTemplateSettingsAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const id = formString(formData, "templateId");
  const template = await loadTemplate(db, id);
  const name = formString(formData, "name");
  const description = formString(formData, "description").slice(0, 300);
  const defaultPeriod = formString(formData, "defaultPeriod");
  if (name.length < 2 || name.length > 120) return { error: "Nom du modèle invalide." };
  if (!isPeriodPreset(defaultPeriod)) return { error: "Période par défaut invalide." };
  const config = parseDashboardConfig(template.config);
  config.defaultPeriod = defaultPeriod;
  config.compareToPreviousPeriod = formData.get("compare") === "on";
  config.viewer.allowPeriodChange = formData.get("allowPeriodChange") === "on";
  config.viewer.allowCampaignFilter = formData.get("allowCampaignFilter") === "on";
  config.viewer.allowCustomize = formData.get("allowCustomize") === "on";
  await db
    .update(dashboardTemplates)
    .set({ name, description: description || null, config: dashboardConfigSchema.parse(config) })
    .where(eq(dashboardTemplates.id, id));
  await log("template.update", "template", id);
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${id}`);
  return { ok: true, message: "Modèle enregistré." };
}

export async function addTemplateSectionAction(formData: FormData): Promise<void> {
  const title = formString(formData, "title").slice(0, 120) || "Nouvelle section";
  await mutateTemplate(formData, (config) => {
    addSection(config, { id: newId("sec"), title, widgets: [] });
  });
}

export async function renameTemplateSectionAction(formData: FormData): Promise<void> {
  const sectionId = formString(formData, "sectionId");
  const title = formString(formData, "title").slice(0, 120);
  if (!title) return;
  await mutateTemplate(formData, (config) => renameSection(config, sectionId, title));
}

export async function deleteTemplateSectionAction(formData: FormData): Promise<void> {
  const sectionId = formString(formData, "sectionId");
  await mutateTemplate(formData, (config) => deleteSection(config, sectionId));
}

export async function moveTemplateSectionAction(formData: FormData): Promise<void> {
  const sectionId = formString(formData, "sectionId");
  const direction = formString(formData, "direction") === "up" ? -1 : 1;
  await mutateTemplate(formData, (config) => moveSection(config, sectionId, direction));
}

export async function addTemplateWidgetAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const sectionId = formString(formData, "sectionId");
  const type = formString(formData, "type");
  const chartStyle = formString(formData, "chartStyle");
  const title = formString(formData, "title").slice(0, 120);
  const metrics = formData.getAll("metrics").filter(isMetricKey);
  if (!(WIDGET_TYPES as readonly string[]).includes(type)) return { error: "Type de widget invalide." };
  if (metrics.length === 0) return { error: "Choisissez au moins un indicateur." };
  if (type === "timeseries" && metrics.length > 2) return { error: "Un graphique temporel affiche 2 indicateurs au maximum." };
  const added = await mutateTemplate(formData, (config) =>
    addWidget(config, sectionId, {
      id: newId("w"),
      type: type as (typeof WIDGET_TYPES)[number],
      metrics,
      title: title || undefined,
      chartStyle: type === "timeseries" && (CHART_STYLES as readonly string[]).includes(chartStyle) ? (chartStyle as (typeof CHART_STYLES)[number]) : undefined,
    }),
  );
  if (!added) return { error: "Cette section contient déjà 12 widgets." };
  return { ok: true, message: "Widget ajouté." };
}

export async function deleteTemplateWidgetAction(formData: FormData): Promise<void> {
  const widgetId = formString(formData, "widgetId");
  await mutateTemplate(formData, (config) => deleteWidget(config, widgetId));
}

export async function moveTemplateWidgetAction(formData: FormData): Promise<void> {
  const widgetId = formString(formData, "widgetId");
  const direction = formString(formData, "direction") === "up" ? -1 : 1;
  await mutateTemplate(formData, (config) => moveWidget(config, widgetId, direction));
}

export async function deleteTemplateFromEditorAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const id = formString(formData, "templateId");
  await db.delete(dashboardTemplates).where(and(eq(dashboardTemplates.id, id), eq(dashboardTemplates.builtIn, false)));
  await log("template.delete", "template", id);
  revalidatePath("/admin/templates");
  redirect("/admin/templates");
}
