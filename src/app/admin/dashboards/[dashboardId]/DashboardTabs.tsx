"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "@/components/admin/NavLink";
import { cx } from "@/components/ui";

const ADMIN_PREVIEW_HINT =
  "Aperçu administrateur. Le client voit la même page via son lien privé, sans accès à l'administration.";

export function DashboardTabs({ dashboardId }: { dashboardId: string }) {
  const pathname = usePathname();
  const base = `/admin/dashboards/${dashboardId}`;
  const tabs: Array<{ href: string; label: string; hint?: string }> = [
    { href: base, label: "Aperçu", hint: ADMIN_PREVIEW_HINT },
    { href: `${base}/edit`, label: "Configuration" },
    { href: `${base}/bilans`, label: "Bilans" },
    { href: `${base}/share`, label: "Partage" },
  ];
  return (
    <nav className="flex gap-1" aria-label="Sections du dashboard">
      {tabs.map((t) => {
        const link = (
          <NavLink
            href={t.href}
            active={pathname === t.href}
            describedBy={t.hint ? "admin-preview-hint" : undefined}
            className={cx(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              (t.href === base ? pathname === base : pathname === t.href || pathname.startsWith(`${t.href}/`))
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {t.label}
          </NavLink>
        );
        if (!t.hint) return <Fragment key={t.href}>{link}</Fragment>;
        return (
          <span key={t.href} className="group relative">
            {link}
            <span
              id="admin-preview-hint"
              role="tooltip"
              className="pointer-events-none invisible absolute top-full left-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-slate-900 px-3 py-2 text-left text-xs leading-5 font-normal text-white shadow-lg group-hover:visible group-focus-within:visible"
            >
              {t.hint}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
