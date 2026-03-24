import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trill Lab",
  description: "16th-note trill BPM benchmark for rhythm game players.",
};

const NAV_ITEMS = [
  { href: "/measure", label: "측정 모드" },
  { href: "/challenge", label: "도전 모드" },
  { href: "/practice", label: "연습 모드" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="site-shell site-header-inner">
            <Link href="/measure" className="brand">
              <span className="brand-mark">TRILL LAB</span>
              <strong>트릴 연습실</strong>
            </Link>
            <nav className="site-nav" aria-label="주요 모드">
              {NAV_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="site-nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <div className="site-shell">{children}</div>
      </body>
    </html>
  );
}
