import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Notice, PageHeader } from "@/components/ui";
import { demoModeEnabled, listPublicDemoDashboards, publicDemoStatus } from "@/server/demo/public-demo";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!demoModeEnabled()) redirect("/admin");

  let dashboards: Awaited<ReturnType<typeof listPublicDemoDashboards>> = [];
  let unavailable = false;
  let hidden = false;
  try {
    const db = await getDb();
    hidden = (await publicDemoStatus(db)) === "hidden";
    if (!hidden) dashboards = await listPublicDemoDashboards(db);
  } catch (error) {
    console.error("demo home failed", error);
    unavailable = true;
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
      <PageHeader
        title="Démo OpenMetrics"
        description={
          hidden
            ? "Les données de démonstration sont masquées."
            : "Deux clients fictifs, avec des statistiques Meta Ads entièrement synthétiques. Aucun compte publicitaire réel n'est connecté."
        }
        actions={
          <Link href="/login" className="text-sm font-medium text-brand-700 hover:underline">
            Espace agence
          </Link>
        }
      />
      {hidden ? (
        <Notice tone="blue" title="Données de démonstration masquées">
          Les chiffres synthétiques ne sont plus affichés. Un compte Meta réel est relié, ou l&apos;affichage a été désactivé dans Connexions Meta.
        </Notice>
      ) : (
        <Notice tone="blue" title="Données de démonstration">
          Les chiffres sont générés pour illustrer le dashboard (dépenses, clics, conversions). Ils ne viennent pas de Meta.
        </Notice>
      )}

      {unavailable && (
        <div className="mt-6">
          <Notice tone="red" title="Démo indisponible">
            La base de démonstration n&apos;a pas pu démarrer. Réessayez dans un instant.
          </Notice>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {dashboards.map((dashboard) => (
          <Link key={dashboard.id} href={`/demo/${dashboard.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
            <Card className="h-full p-5 transition-colors hover:border-brand-500">
              <p className="text-xs font-medium uppercase tracking-wide text-brand-600">{dashboard.clientName}</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{dashboard.name}</h2>
              <p className="mt-2 text-sm text-slate-500">{dashboard.accounts.join(" · ")}</p>
              <p className="mt-4 text-sm font-medium text-brand-700">Ouvrir le dashboard</p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
