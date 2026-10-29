"use client";

import Link, { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

export function NavLink({
  href,
  active,
  className,
  children,
}: {
  href: string;
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className} aria-current={active ? "page" : undefined}>
      {children}
      <LinkPending />
    </Link>
  );
}

/** Fixed-size hint so a slow navigation is visible without shifting the label. */
function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cx(
        "ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current transition-opacity duration-150",
        pending ? "animate-pulse opacity-100" : "opacity-0",
      )}
    />
  );
}
