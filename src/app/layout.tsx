import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trill Lab",
  description: "16th-note trill BPM benchmark for rhythm game players.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
