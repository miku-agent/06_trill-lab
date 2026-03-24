"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/measure", label: "측정 모드" },
  { href: "/challenge", label: "도전 모드" },
  { href: "/practice", label: "연습 모드" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="주요 모드">
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
