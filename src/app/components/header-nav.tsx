"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/measure", label: "Measure" },
  { href: "/stats", label: "Stats" },
  { href: "/challenge", label: "Challenge" },
  { href: "/practice", label: "Practice" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="주요 내비게이션">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} className={`site-nav-link ${isActive ? "is-active" : ""}`} aria-current={isActive ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
