"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { chartColorsSchema } from "@/lib/chart-colors";
import {
  CHART_STYLES,
  WIDGET_TYPES,
  dashboardConfigSchema,
  newId,
  parseDashboardConfig,
  type DashboardConfig,
} from "@/lib/dashboard-config";
import { isMetricKey } from "@/lib/metrics";
import { isPeriodPreset } from "@/lib/periods";
import { adAccounts, clients, dashboards, dashboardTemplates } from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import { adminContext, formString, type ActionState } from "./context";

async function loadDashboard(db: Db, id: string) {
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, id));
  if (!dashboard) throw new Error("Dashboard introuvable.");
  return dashboard;
}

async function saveConfig(db: Db, id: string, config: DashboardConfig) {
  const valid = dashboardConfigSchema.parse(config);
  await db.update(dashboards).set({ config: valid, updatedAt: new Date() }).where(eq(dashboards.id, id));
  revalidatePath(`/admin/dashboards/${id}`);
}

async function mutateConfig(formData: FormData, mutate: (config: DashboardConfig) => void): Promise<void> {
  const { db, log } = await adminContext();
  const id = formString(formData, "dashboardId");
  const dashboard = await loadDashboard(db, id);
  const config = parseDashboardConfig(dashboard.config);
  mutate(config);
  await saveConfig(db, id, config);
  await log("dashboard.update_config", "dashboard", id);
}

export async function createDashboardAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const clientId = formString(formData, "clientId");
  const templateId = formString(formData, "templateId");
  const name = formString(formData, "name");
  if (name.length < 2 || name.length > 120) return { error: "Nom du dashboard invalide." };
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  const [template] = await db.select().from(dashboardTemplates).where(eq(dashboardTemplates.id, templateId));
  if (!client || !template) return { error: "Client ou modèle introuvable." };
  const [dashboard] = await db
    .insert(dashboards)
    .values({ clientId, name, config: parseDashboardConfig(template.config) })
    .returning();
  await log("dashboard.create", "dashboard", dashboard.id, { clientId, templateId });
  redirect(`/admin/dashboards/${dashboard.id}`);
}

export async function duplicateDashboardAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const source = await loadDashboard(db, formString(formData, "dashboardId"));
  const targetClientId = formString(formData, "targetClientId") || source.clientId;
  const name = formString(formData, "name") || `${source.name} (copie)`;
  const [client] = await db.select().from(clients).where(eq(clients.id, targetClientId));
  if (!client) return { error: "Client cible introuvable." };
  // Account selection is client-specific and is never carried over to another client.
  const accountIds = targetClientId === source.clientId ? source.adAccountIds : [];
  const [copy] = await db
    .insert(dashboards)
    .values({ clientId: targetClientId, name, config: source.config, adAccountIds: accountIds })
    .returning();
  await log("dashboard.duplicate", "dashboard", copy.id, { from: source.id, targetClientId });
  redirect(`/admin/dashboards/${copy.id}`);
}

export async function deleteDashboardAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const id = formString(formData, "dashboardId");
  if (formString(formData, "confirm") !== "SUPPRIMER") return;
  await db.delete(dashboards).where(eq(dashboards.id, id));
  await log("dashboard.delete", "dashboard", id);
  redirect("/admin/dashboards");
}

export async function updateDashboardSettingsAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const id = formString(formData, "dashboardId");
  const dashboard = await loadDashboard(db, id);
  const name = formString(formData, "name");
  const defaultPeriod = formString(formData, "defaultPeriod");
  if (name.length < 2 || name.length > 120) return { error: "Nom invalide." };
  if (!isPeriodPreset(defaultPeriod)) return { error: "Période par défaut invalide." };

  const clientAccounts = await db
    .select({ id: adAccounts.id, currency: adAccounts.currency })
    .from(adAccounts)
    .where(eq(adAccounts.clientId, dashboard.clientId));
  const allowedIds = new Set(clientAccounts.map((a) => a.id));
  const accountIds = formData.getAll("adAccountIds").filter((v): v is string => typeof v === "string" && allowedIds.has(v));
  const scoped = accountIds.length ? clientAccounts.filter((a) => accountIds.includes(a.id)) : clientAccounts;
  if (new Set(scoped.map((a) => a.currency)).size > 1) {
    return { error: "Les comptes sélectionnés utilisent des devises différentes : leurs montants ne peuvent pas être additionnés." };
  }

  const config = parseDashboardConfig(dashboard.config);
  config.defaultPeriod = defaultPeriod;
  config.compareToPreviousPeriod = formData.get("compare") === "on";
  config.viewer.allowPeriodChange = formData.get("allowPeriodChange") === "on";
  config.viewer.allowCampaignFilter = formData.get("allowCampaignFilter") === "on";

  await db
    .update(dashboards)
    .set({ name, adAccountIds: accountIds, config: dashboardConfigSchema.parse(config), updatedAt: new Date() })
    .where(eq(dashboards.id, id));
  await log("dashboard.update_settings", "dashboard", id);
  revalidatePath(`/admin/dashboards/${id}`, "layout");
  revalidatePath("/admin/dashboards");
  revalidatePath(`/admin/clients/${dashboard.clientId}`);
  return { ok: true, message: "Paramètres enregistrés." };
}

export async function renameDashboardAction(dashboardId: string, name: string): Promise<ActionState> {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return { error: "Le nom doit contenir entre 2 et 120 caractères." };
  const { db, log } = await adminContext();
  const dashboard = await loadDashboard(db, dashboardId);
  if (dashboard.name !== trimmed) {
    await db.update(dashboards).set({ name: trimmed, updatedAt: new Date() }).where(eq(dashboards.id, dashboard.id));
    await log("dashboard.rename", "dashboard", dashboard.id);
  }
  revalidatePath(`/admin/dashboards/${dashboard.id}`, "layout");
  revalidatePath("/admin/dashboards");
  revalidatePath(`/admin/clients/${dashboard.clientId}`);
  return { ok: true };
}

export async function updateChartColorsAction(dashboardId: string, colors: string[]): Promise<ActionState> {
  const parsed = chartColorsSchema.safeParse(colors);
  if (!parsed.success) return { error: "Choisissez une couleur de la palette." };
  const { db, log } = await adminContext();
  const dashboard = await loadDashboard(db, dashboardId);
  const config = parseDashboardConfig(dashboard.config);
  if (config.chartColors[0] === parsed.data[0] && config.chartColors[1] === parsed.data[1]) return { ok: true };
  config.chartColors = parsed.data;
  await saveConfig(db, dashboard.id, config);
  await log("dashboard.update_colors", "dashboard", dashboard.id);
  return { ok: true };
}

export async function addSectionAction(formData: FormData): Promise<void> {
  const title = formString(formData, "title").slice(0, 120) || "Nouvelle section";
  await mutateConfig(formData, (c) => {
    c.sections.push({ id: newId("sec"), title, widgets: [] });
  });
}

export async function renameSectionAction(formData: FormData): Promise<void> {
  const sectionId = formString(formData, "sectionId");
  const title = formString(formData, "title").slice(0, 120);
  if (!title) return;
  await mutateConfig(formData, (c) => {
    const section = c.sections.find((s) => s.id === sectionId);
    if (section) section.title = title;
  });
}

export async function deleteSectionAction(formData: FormData): Promise<void> {
  const sectionId = formString(formData, "sectionId");
  await mutateConfig(formData, (c) => {
    c.sections = c.sections.filter((s) => s.id !== sectionId);
  });
}

function move<T>(list: T[], index: number, direction: number): void {
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
}

export async function moveSectionAction(formData: FormData): Promise<void> {
  const sectionId = formString(formData, "sectionId");
  const direction = formString(formData, "direction") === "up" ? -1 : 1;
  await mutateConfig(formData, (c) => move(c.sections, c.sections.findIndex((s) => s.id === sectionId), direction));
}

export async function addWidgetAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const sectionId = formString(formData, "sectionId");
  const type = formString(formData, "type");
  const chartStyle = formString(formData, "chartStyle");
  const title = formString(formData, "title").slice(0, 120);
  const metrics = formData.getAll("metrics").filter(isMetricKey);
  if (!(WIDGET_TYPES as readonly string[]).includes(type)) return { error: "Type de widget invalide." };
  if (metrics.length === 0) return { error: "Choisissez au moins un indicateur." };
  if (type === "timeseries" && metrics.length > 2) return { error: "Un graphique temporel affiche 2 indicateurs au maximum." };
  await mutateConfig(formData, (c) => {
    const section = c.sections.find((s) => s.id === sectionId);
    section?.widgets.push({
      id: newId("w"),
      type: type as (typeof WIDGET_TYPES)[number],
      metrics,
      title: title || undefined,
      chartStyle: type === "timeseries" && (CHART_STYLES as readonly string[]).includes(chartStyle) ? (chartStyle as (typeof CHART_STYLES)[number]) : undefined,
    });
  });
  return { ok: true, message: "Widget ajouté." };
}

export async function deleteWidgetAction(formData: FormData): Promise<void> {
  const widgetId = formString(formData, "widgetId");
  await mutateConfig(formData, (c) => {
    for (const s of c.sections) s.widgets = s.widgets.filter((w) => w.id !== widgetId);
  });
}

export async function moveWidgetAction(formData: FormData): Promise<void> {
  const widgetId = formString(formData, "widgetId");
  const direction = formString(formData, "direction") === "up" ? -1 : 1;
  await mutateConfig(formData, (c) => {
    for (const s of c.sections) move(s.widgets, s.widgets.findIndex((w) => w.id === widgetId), direction);
  });
}

export async function saveAsTemplateAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { db, log } = await adminContext();
  const dashboard = await loadDashboard(db, formString(formData, "dashboardId"));
  const name = formString(formData, "name");
  if (name.length < 2 || name.length > 120) return { error: "Nom du modèle invalide." };
  const [template] = await db
    .insert(dashboardTemplates)
    .values({ name, description: formString(formData, "description").slice(0, 300) || null, config: parseDashboardConfig(dashboard.config) })
    .returning();
  await log("template.create", "template", template.id, { from: dashboard.id });
  revalidatePath("/admin/templates");
  return { ok: true, message: `Modèle « ${name} » enregistré.` };
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const { db, log } = await adminContext();
  const id = formString(formData, "templateId");
  await db.delete(dashboardTemplates).where(and(eq(dashboardTemplates.id, id), eq(dashboardTemplates.builtIn, false)));
  await log("template.delete", "template", id);
  revalidatePath("/admin/templates");
}
