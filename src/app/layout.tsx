import type { Metadata } from "next";
import packageJson from "../../package.json";
import Link from "next/link";
import Script from "next/script";
import { HeaderNav } from "./components/header-nav";
import { ThemeToggle } from "./components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trill Lab",
  description: "리듬게임 유저를 위한 16비트 트릴 BPM 측정 도구예요.",
};

const GTM_ID = "GTM-5PL4QXZC";
const APP_VERSION = packageJson.version;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" as="style" crossOrigin="anonymous" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('trill-theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <Script id="gtm-base" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <header className="site-header">
          <div className="site-shell site-header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">TRILL LAB</span>
              <span className="brand-version">v{APP_VERSION}</span>
            </Link>
            <HeaderNav />
            <div className="header-actions">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div className="site-shell">{children}</div>
        <footer className="site-footer">
          <div className="site-shell site-footer-inner">
            <strong>{`Trill Lab - v${APP_VERSION}`}</strong>
          </div>
        </footer>
      </body>
    </html>
  );
}
