import Link from "next/link";
import { PATTERN_DEFINITIONS } from "./lib/patterns";

export default function HomePage() {
  return (
    <main className="page-main">
      <section className="page-section hero-section">
        <span className="eyebrow">PATTERN SELECT</span>
        <h1 className="page-title">어떤 패턴을 측정할까요?</h1>
        <p className="section-subtitle">
          먼저 패턴을 고르고, 그다음에 측정 모드에서 키를 맞춘 뒤 바로 연습 데이터를 확인해보세요.
        </p>
      </section>

      <section className="pattern-select-grid" aria-label="패턴 선택">
        {PATTERN_DEFINITIONS.map((pattern) => (
          <Link key={pattern.key} href={pattern.href} className="pattern-select-card panel">
            <strong>{pattern.label}</strong>
            <p>{pattern.description}</p>
            <span>측정 시작</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
