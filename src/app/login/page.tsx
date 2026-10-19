import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/server/auth/admin";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion — OpenMetrics" };

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/admin");
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">OpenMetrics</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900">Espace agence</h1>
          <p className="mt-1 text-sm text-slate-500">Reporting Meta Ads — accès administrateur</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
