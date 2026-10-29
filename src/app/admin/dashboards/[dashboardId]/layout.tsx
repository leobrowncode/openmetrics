import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DashboardTitle } from "@/components/admin/DashboardTitle";
import { plainDashes } from "@/lib/text";
import { requireAdmin } from "@/server/auth/admin";
import { getDb } from "@/server/db/client";
import { clients, dashboards } from "@/server/db/schema";
import { DashboardTabs } from "./DashboardTabs";

export default async function DashboardLayout(props: LayoutProps<"/admin/dashboards/[dashboardId]">) {
  await requireAdmin();
  const { dashboardId } = await props.params;
  const db = await getDb();
  const [row] = await db
    .select({ name: dashboards.name, clientId: clients.id, clientName: clients.name })
    .from(dashboards)
    .innerJoin(clients, eq(clients.id, dashboards.clientId))
    .where(eq(dashboards.id, dashboardId));
  if (!row) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <Link href={`/admin/clients/${row.clientId}`} className="text-sm font-medium text-brand-600 hover:underline">
            {plainDashes(row.clientName)}
          </Link>
          <DashboardTitle dashboardId={dashboardId} name={row.name} />
        </div>
        <DashboardTabs dashboardId={dashboardId} />
      </div>
      {props.children}
    </div>
  );
}
