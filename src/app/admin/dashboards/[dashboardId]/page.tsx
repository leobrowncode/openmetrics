import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { Notice } from "@/components/ui";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { clients, dashboards } from "@/server/db/schema";
import { loadDashboardPayload } from "@/server/dashboards/query";

export default async function DashboardPreviewPage(props: PageProps<"/admin/dashboards/[dashboardId]">) {
  await requireAdmin();
  const { dashboardId } = await props.params;
  const db = await getDb();
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!dashboard) notFound();
  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, dashboard.clientId));

  const searchParams = await props.searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (typeof value === "string") params.set(key, value);
  let payload = await loadDashboardPayload(db, dashboard, params, "admin");
  if ("error" in payload) payload = await loadDashboardPayload(db, dashboard, new URLSearchParams(), "admin");
  if ("error" in payload) return <Notice tone="red">{payload.error}</Notice>;

  return (
    <div className="space-y-4">
      <Notice tone="blue">Aperçu administrateur. Le client voit la même page via son lien privé, sans accès à l&apos;administration.</Notice>
      <DashboardView
        config={parseDashboardConfig(dashboard.config)}
        initial={payload}
        dataUrl={`/admin/dashboards/${dashboard.id}/data`}
        mode="admin"
        title={dashboard.name}
        subtitle={client?.name}
        dashboardId={dashboard.id}
      />
    </div>
  );
}
