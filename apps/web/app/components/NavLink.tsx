"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname?.startsWith(href);
  return (
    <Link href={href} className={isActive ? "is-active" : undefined} aria-current={isActive ? "page" : undefined}>
      {children}
    </Link>
  );
}
