import Link from "next/link";

const MODES = [
  {
    key: "measure",
    label: "측정",
    description: "BPM과 안정성을 측정해요. 트릴, 드르륵, 연타 패턴을 골라 실력을 확인하세요.",
    href: "/measure",
    disabled: false,
  },
  {
    key: "practice",
    label: "연습",
    description: "BPM에 맞춰 리듬 연습을 할 수 있어요. 측정 결과를 바탕으로 실력을 키워보세요.",
    href: "/practice",
    disabled: false,
  },
  {
    key: "challenge",
    label: "챌린지",
    description: "다른 유저와 실력을 겨뤄보세요. 랭킹에 도전할 수 있어요.",
    href: "/challenge",
    disabled: true,
  },
] as const;

export default function HomePage() {
  return (
    <main className="page-main">
      <section className="page-section hero-section">
        <span className="eyebrow">MODE SELECT</span>
        <h1 className="page-title">무엇을 할까요?</h1>
        <p className="section-subtitle">모드를 선택하세요. 측정으로 실력을 확인하고, 연습으로 키워보세요.</p>
      </section>

      <section className="mode-select-grid" aria-label="모드 선택">
        {MODES.map((mode) =>
          mode.disabled ? (
            <div key={mode.key} className="mode-select-card panel is-disabled" aria-disabled="true">
              <div className="mode-select-card-header">
                <strong>{mode.label}</strong>
                <span className="coming-soon-badge">Coming Soon</span>
              </div>
              <p>{mode.description}</p>
            </div>
          ) : (
            <Link key={mode.key} href={mode.href} className="mode-select-card panel">
              <strong>{mode.label}</strong>
              <p>{mode.description}</p>
              <span>시작하기</span>
            </Link>
          ),
        )}
      </section>
    </main>
  );
}
