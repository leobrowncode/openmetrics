import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { parseDashboardConfig } from "@/lib/dashboard-config";
import { getDb } from "@/server/db/client";
import { clients } from "@/server/db/schema";
import { loadDashboardPayload } from "@/server/dashboards/query";
import { verifyViewer } from "@/server/share/viewer-session";

export const metadata: Metadata = {
  title: "Reporting Meta Ads",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

function InvalidLink() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-base font-semibold text-slate-900">Ce lien n&apos;est plus valide</p>
        <p className="mt-2 text-sm text-slate-600">
          Il a peut-être expiré ou été révoqué. Rouvrez le lien d&apos;origine ou contactez votre agence pour en obtenir un nouveau.
        </p>
      </div>
    </main>
  );
}

export default async function ViewerPage(props: PageProps<"/share/[linkId]">) {
  const { linkId } = await props.params;
  const db = await getDb();
  const share = await verifyViewer(db, linkId);
  if (!share) return <InvalidLink />;

  const searchParams = await props.searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) if (typeof value === "string") params.set(key, value);

  const payload = await loadDashboardPayload(db, share.dashboard, params, "viewer");
  const fallback = "error" in payload ? await loadDashboardPayload(db, share.dashboard, new URLSearchParams(), "viewer") : payload;
  if ("error" in fallback) return <InvalidLink />;
  const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, share.dashboard.clientId));

  return (
    <main className="flex-1 px-4 py-8 sm:px-8">
      <DashboardView
        config={parseDashboardConfig(share.dashboard.config)}
        initial={fallback}
        dataUrl={`/share/${linkId}/data`}
        mode="viewer"
        title={share.dashboard.name}
        subtitle={client?.name}
        dashboardId={share.dashboard.id}
      />
    </main>
  );
}
