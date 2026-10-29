"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/admin/NavLink";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "Vue d'ensemble", exact: true },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/dashboards", label: "Dashboards" },
  { href: "/admin/templates", label: "Modèles" },
  { href: "/admin/connections", label: "Connexions Meta" },
  { href: "/admin/syncs", label: "Synchronisations" },
  { href: "/admin/team", label: "Équipe" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Navigation admin">
      {ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <NavLink
            key={item.href}
            href={item.href}
            active={active}
            className={cx(
              "rounded-md px-2.5 py-1.5 text-sm font-medium",
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
