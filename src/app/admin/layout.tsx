import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/admin";
import { logoutAction } from "../login/actions";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = { title: "Admin — OpenMetrics", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-sm font-bold uppercase tracking-widest text-brand-600">
              OpenMetrics
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>{admin.email}</span>
            <form action={logoutAction}>
              <button className="text-slate-600 underline-offset-2 hover:underline">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
