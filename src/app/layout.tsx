import type { Metadata } from "next";
import Link from "next/link";
import { HeaderNav } from "./components/header-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trill Lab",
  description: "16th-note trill BPM benchmark for rhythm game players.",
};

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
            <HeaderNav />
          </div>
        </header>
        <div className="site-shell">{children}</div>
      </body>
    </html>
  );
}
