"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/admin/NavLink";
import { cx } from "@/components/ui";

export function DashboardTabs({ dashboardId }: { dashboardId: string }) {
  const pathname = usePathname();
  const base = `/admin/dashboards/${dashboardId}`;
  const tabs = [
    { href: base, label: "Aperçu" },
    { href: `${base}/edit`, label: "Configuration" },
    { href: `${base}/bilans`, label: "Bilans" },
    { href: `${base}/share`, label: "Partage" },
  ];
  return (
    <nav className="flex gap-1" aria-label="Sections du dashboard">
      {tabs.map((t) => (
        <NavLink
          key={t.href}
          href={t.href}
          active={pathname === t.href}
          className={cx(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            (t.href === base ? pathname === base : pathname === t.href || pathname.startsWith(`${t.href}/`))
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
