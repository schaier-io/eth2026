"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function DeckSlideLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (typeof window === "undefined") return;
        if (!href.startsWith("#")) return;
        const nextHash = href.slice(1);
        if (window.location.hash === href) {
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        } else {
          window.location.hash = nextHash;
        }
      }}
    >
      {children}
    </Link>
  );
}
