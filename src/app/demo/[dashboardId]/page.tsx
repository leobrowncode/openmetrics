import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { Notice } from "@/components/ui";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { getPublicDemoDashboard } from "@/server/demo/public-demo";
import { getDb } from "@/server/db/client";
import { loadDashboardPayload } from "@/server/dashboards/query";

export const dynamic = "force-dynamic";

export default async function PublicDemoDashboardPage(props: PageProps<"/demo/[dashboardId]">) {
  const { dashboardId } = await props.params;
  const db = await getDb();
  const demo = await getPublicDemoDashboard(db, dashboardId);
  if (!demo) notFound();

  const searchParams = await props.searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (typeof value === "string") params.set(key, value);
  let payload = await loadDashboardPayload(db, demo.dashboard, params, "viewer");
  if ("error" in payload) payload = await loadDashboardPayload(db, demo.dashboard, new URLSearchParams(), "viewer");
  if ("error" in payload) {
    return (
      <main className="mx-auto max-w-3xl flex-1 px-4 py-10">
        <Notice tone="red">{payload.error}</Notice>
      </main>
    );
  }

  return (
    <main className="flex-1 px-4 py-8 sm:px-8">
      <div className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
          Toutes les démos
        </Link>
        <Link href="/login" className="text-sm text-slate-500 hover:underline">
          Espace agence
        </Link>
      </div>
      <div className="mx-auto mb-4 max-w-7xl">
        <Notice tone="blue">
          Aperçu client avec des données synthétiques. Le filtre de période et le tableau par campagne fonctionnent comme sur un lien privé.
        </Notice>
      </div>
      <DashboardView
        config={parseDashboardConfig(demo.dashboard.config)}
        initial={payload}
        dataUrl={`/demo/${demo.dashboard.id}/data`}
        mode="viewer"
        title={demo.dashboard.name}
        subtitle={demo.clientName}
      />
    </main>
  );
}
