import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/server/auth/admin";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from "@/server/db/bootstrap";
import { demoModeEnabled, publicDemoStatus } from "@/server/demo/public-demo";
import { getDb } from "@/server/db/client";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion — OpenMetrics" };

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/admin");
  let demoHome = false;
  if (demoModeEnabled()) {
    try {
      demoHome = (await publicDemoStatus(await getDb())) === "visible";
    } catch {
      demoHome = false;
    }
  }
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">OpenMetrics</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Espace agence</h1>
          <p className="mt-1 text-sm text-slate-500">Reporting Meta Ads — accès administrateur</p>
        </div>
        <LoginForm />
        {demoModeEnabled() && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Démo : {DEMO_ADMIN_EMAIL} / {DEMO_ADMIN_PASSWORD}.
            {demoHome && (
              <>
                {" "}
                <Link href="/" className="text-brand-700 hover:underline">
                  Retour aux dashboards
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    </main>
  );
}
