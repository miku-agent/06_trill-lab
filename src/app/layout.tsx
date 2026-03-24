import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HeaderNav } from "./components/header-nav";
import { PatternSwitcher } from "./components/pattern-switcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trill Lab",
  description: "리듬게임 유저를 위한 16비트 트릴 BPM 측정 도구예요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="site-shell site-header-inner">
            <div className="site-header-brand-row">
              <Link href="/" className="brand">
                <span className="brand-mark">TRILL LAB</span>
                <strong>Trill practice studio</strong>
              </Link>
              <Suspense fallback={null}>
                <PatternSwitcher />
              </Suspense>
            </div>
            <HeaderNav />
          </div>
        </header>
        <div className="site-shell">{children}</div>
      </body>
    </html>
  );
}
