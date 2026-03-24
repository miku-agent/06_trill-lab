"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HandKey = "A" | "L";
type SessionState = "idle" | "countdown" | "running" | "finished";
type ModeKey = "measure" | "challenge" | "practice";

type Result = {
  bpm: number;
  validHits: number;
  invalidHits: number;
  accuracy: number;
  peakStreak: number;
};

type ModeCard = {
  key: ModeKey;
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  bullets: string[];
};

const COUNTDOWN_SECONDS = 3;
const TEST_SECONDS = 10;
const ACCEPTED_KEYS: HandKey[] = ["A", "L"];

const MODE_CARDS: ModeCard[] = [
  {
    key: "measure",
    eyebrow: "MODE 01",
    title: "측정 모드",
    description: "현재 한계 속도를 짧고 정확하게 재는 기본 모드예요.",
    status: "LIVE",
    bullets: ["16비트 기준 BPM 계산", "정확도 + 스트릭 표시", "기록 갱신용 반복 측정"],
  },
  {
    key: "challenge",
    eyebrow: "MODE 02",
    title: "도전 모드",
    description: "목표 BPM을 정해두고 버티는 방식으로 설계할 예정이에요.",
    status: "COMING SOON",
    bullets: ["목표 BPM 선택", "지속 시간 미션", "클리어 / 실패 판정"],
  },
  {
    key: "practice",
    eyebrow: "MODE 03",
    title: "연습 모드",
    description: "낮은 속도부터 단계적으로 감각을 익히는 훈련 모드예요.",
    status: "COMING SOON",
    bullets: ["속도 단계별 루프", "좌우 안정성 훈련", "패턴별 확장 가능"],
  },
];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export default function HomePage() {
  const [selectedMode, setSelectedMode] = useState<ModeKey>("measure");
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [countdownLeft, setCountdownLeft] = useState(COUNTDOWN_SECONDS);
  const [timeLeft, setTimeLeft] = useState(TEST_SECONDS);
  const [lastAcceptedKey, setLastAcceptedKey] = useState<HandKey | null>(null);
  const [latestInput, setLatestInput] = useState<string>("-");
  const [validHits, setValidHits] = useState(0);
  const [invalidHits, setInvalidHits] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [peakStreak, setPeakStreak] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const validHitsRef = useRef(0);
  const invalidHitsRef = useRef(0);
  const peakStreakRef = useRef(0);

  const selectedCard = MODE_CARDS.find((card) => card.key === selectedMode) ?? MODE_CARDS[0];

  const helperText = useMemo(() => {
    if (selectedMode !== "measure") {
      return "이 모드는 아직 레이아웃만 잡혀 있어요. 먼저 측정 모드로 감을 확인해보세요.";
    }

    if (sessionState === "countdown") {
      return `준비... ${countdownLeft}초 후 측정 시작`;
    }

    if (sessionState === "running") {
      return "A와 L만 사용해서 정확히 번갈아 누르세요.";
    }

    if (result) {
      return "같은 손가락 반복은 invalid 처리돼요. 정확도를 유지하면서 BPM을 끌어올리는 게 핵심이에요.";
    }

    return "키보드 A / L 교대 입력만 인정합니다. 10초 동안 한계 속도로 트릴을 쳐보세요.";
  }, [countdownLeft, result, selectedMode, sessionState]);

  const finishRun = useCallback(() => {
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("finished");

    const totalHits = validHitsRef.current + invalidHitsRef.current;
    const accuracy = totalHits === 0 ? 0 : (validHitsRef.current / totalHits) * 100;
    const bpm = Math.round((validHitsRef.current / 4 / TEST_SECONDS) * 60);

    setResult({
      bpm,
      validHits: validHitsRef.current,
      invalidHits: invalidHitsRef.current,
      accuracy,
      peakStreak: peakStreakRef.current,
    });
  }, []);

  useEffect(() => {
    if (sessionState !== "countdown") {
      return;
    }

    const timer = window.setTimeout(() => {
      if (countdownLeft <= 1) {
        setSessionState("running");
        setTimeLeft(TEST_SECONDS);
        deadlineRef.current = Date.now() + TEST_SECONDS * 1000;
        runningRef.current = true;
        return;
      }

      setCountdownLeft((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdownLeft, sessionState]);

  useEffect(() => {
    if (sessionState !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      if (!deadlineRef.current) {
        return;
      }

      const remainingMs = deadlineRef.current - Date.now();
      if (remainingMs <= 0) {
        finishRun();
        return;
      }

      setTimeLeft(Number((remainingMs / 1000).toFixed(1)));
    }, 50);

    return () => window.clearInterval(interval);
  }, [finishRun, sessionState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      if (!runningRef.current || !ACCEPTED_KEYS.includes(key as HandKey)) {
        return;
      }

      event.preventDefault();
      setLatestInput(key);

      if (lastAcceptedKey === null || lastAcceptedKey !== key) {
        setLastAcceptedKey(key as HandKey);
        setValidHits((current) => {
          const next = current + 1;
          validHitsRef.current = next;
          return next;
        });
        setCurrentStreak((current) => {
          const next = current + 1;
          setPeakStreak((peak) => {
            const nextPeak = Math.max(peak, next);
            peakStreakRef.current = nextPeak;
            return nextPeak;
          });
          return next;
        });
        return;
      }

      setInvalidHits((current) => {
        const next = current + 1;
        invalidHitsRef.current = next;
        return next;
      });
      setCurrentStreak(0);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lastAcceptedKey]);

  function resetStats() {
    setCountdownLeft(COUNTDOWN_SECONDS);
    setTimeLeft(TEST_SECONDS);
    setLastAcceptedKey(null);
    setLatestInput("-");
    setValidHits(0);
    setInvalidHits(0);
    setCurrentStreak(0);
    setPeakStreak(0);
    setResult(null);
    deadlineRef.current = null;
    runningRef.current = false;
    validHitsRef.current = 0;
    invalidHitsRef.current = 0;
    peakStreakRef.current = 0;
  }

  function startRun() {
    if (selectedMode !== "measure") {
      return;
    }

    resetStats();
    setSessionState("countdown");
  }

  function changeMode(mode: ModeKey) {
    setSelectedMode(mode);
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("idle");
    resetStats();
  }

  const statusTone =
    sessionState === "running"
      ? "running"
      : sessionState === "finished"
        ? "finished"
        : "idle";

  return (
    <main style={{ padding: "32px 16px 80px" }}>
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto", display: "grid", gap: 24 }}>
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 28,
            padding: 28,
            backdropFilter: "blur(18px)",
            boxShadow: "0 20px 80px rgba(0, 0, 0, 0.28)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
              alignItems: "end",
            }}
          >
            <div>
              <p style={{ color: "var(--accent-strong)", margin: 0, fontWeight: 700, letterSpacing: "0.08em" }}>
                TRILL LAB
              </p>
              <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 4.5rem)", margin: "12px 0 14px" }}>
                트릴을 재고, 버티고, 익히는 연습실
              </h1>
              <p style={{ color: "var(--muted)", margin: 0, lineHeight: 1.8, maxWidth: 680 }}>
                이제부터 Trill Lab은 단순 측정기보다 한 단계 넓은 구조로 가요. <strong>측정 모드</strong>에서 현재
                실력을 확인하고, <strong>도전 모드</strong>에서 목표 BPM을 버티고, <strong>연습 모드</strong>에서 안정성을 쌓는 흐름으로
                레이아웃을 먼저 잡았습니다.
              </p>
            </div>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 24,
                padding: 20,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <p style={{ marginTop: 0, color: "var(--muted)" }}>현재 포지션</p>
              <div style={{ display: "grid", gap: 10 }}>
                <QuickStat label="활성 모드" value={selectedCard.title} />
                <QuickStat label="지금 구현됨" value="측정 모드 MVP" />
                <QuickStat label="다음 확장" value="도전 / 연습 로직" />
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {MODE_CARDS.map((card) => {
            const isActive = card.key === selectedMode;

            return (
              <button
                key={card.key}
                onClick={() => changeMode(card.key)}
                style={{
                  textAlign: "left",
                  borderRadius: 24,
                  border: isActive ? "1px solid rgba(100, 245, 231, 0.7)" : "1px solid var(--line)",
                  background: isActive ? "rgba(57, 197, 187, 0.12)" : "var(--panel-strong)",
                  padding: 22,
                  cursor: "pointer",
                  color: "var(--text)",
                  boxShadow: isActive ? "0 0 0 1px rgba(100, 245, 231, 0.14) inset" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span style={{ color: "var(--accent-strong)", fontWeight: 700, letterSpacing: "0.06em" }}>
                    {card.eyebrow}
                  </span>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      background: isActive ? "rgba(100, 245, 231, 0.16)" : "rgba(255,255,255,0.06)",
                    }}
                  >
                    {card.status}
                  </span>
                </div>
                <h2 style={{ margin: "14px 0 8px", fontSize: 28 }}>{card.title}</h2>
                <p style={{ color: "var(--muted)", lineHeight: 1.7, minHeight: 54 }}>{card.description}</p>
                <ul style={{ paddingLeft: 18, color: "var(--muted)", marginBottom: 0, lineHeight: 1.8 }}>
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr", gap: 20 }}>
          <article
            style={{
              background: "var(--panel-strong)",
              border: "1px solid var(--line)",
              borderRadius: 28,
              padding: 24,
              display: "grid",
              gap: 18,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
              <div>
                <p style={{ color: "var(--muted)", margin: 0 }}>현재 선택된 모드</p>
                <h3 style={{ margin: "8px 0 10px", fontSize: 32 }}>{selectedCard.title}</h3>
                <p style={{ color: "var(--muted)", margin: 0, lineHeight: 1.8 }}>{helperText}</p>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 999,
                  padding: "8px 14px",
                  background:
                    statusTone === "running"
                      ? "rgba(57, 197, 187, 0.14)"
                      : statusTone === "finished"
                        ? "rgba(100, 245, 231, 0.14)"
                        : "rgba(255, 255, 255, 0.06)",
                  border: "1px solid var(--line)",
                  fontWeight: 700,
                  height: "fit-content",
                }}
              >
                {selectedMode !== "measure"
                  ? selectedCard.status
                  : sessionState === "countdown"
                    ? `COUNTDOWN ${countdownLeft}`
                    : sessionState === "running"
                      ? `RUNNING ${timeLeft.toFixed(1)}s`
                      : sessionState === "finished"
                        ? "FINISHED"
                        : "READY"}
              </div>
            </div>

            {selectedMode === "measure" ? (
              <>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={startRun}
                    disabled={sessionState === "countdown" || sessionState === "running"}
                    style={{
                      border: 0,
                      borderRadius: 16,
                      padding: "14px 18px",
                      background: "linear-gradient(135deg, var(--accent), var(--accent-strong))",
                      color: "#062127",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {result ? "다시 측정하기" : "측정 시작"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <Stat label="마지막 입력" value={latestInput} />
                  <Stat label="유효 입력" value={String(validHits)} />
                  <Stat label="무효 입력" value={String(invalidHits)} />
                  <Stat label="현재 스트릭" value={String(currentStreak)} />
                  <Stat label="최대 스트릭" value={String(peakStreak)} />
                </div>

                <div
                  style={{
                    borderRadius: 22,
                    padding: 20,
                    border: "1px solid var(--line)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <p style={{ color: "var(--muted)", marginTop: 0 }}>결과</p>
                  <h2 style={{ margin: "0 0 8px", fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
                    {result ? `현재 기록: 16비트 트릴 기준 ${result.bpm} BPM` : "아직 기록이 없어요"}
                  </h2>
                  <p style={{ color: "var(--muted)", marginBottom: 0 }}>
                    {result
                      ? `정확도 ${formatPercent(result.accuracy)} · 유효 ${result.validHits} · 무효 ${result.invalidHits} · 최대 스트릭 ${result.peakStreak}`
                      : "측정이 끝나면 BPM / 정확도 / 스트릭이 함께 표시됩니다."}
                  </p>
                </div>
              </>
            ) : (
              <div
                style={{
                  borderRadius: 22,
                  padding: 24,
                  border: "1px dashed var(--line)",
                  background: "rgba(255,255,255,0.02)",
                  color: "var(--muted)",
                  lineHeight: 1.8,
                }}
              >
                <strong style={{ color: "var(--text)" }}>{selectedCard.title}</strong>
                <p style={{ marginBottom: 0 }}>
                  여기에는 각 모드 전용 플레이 UI가 들어갈 예정이에요. 지금은 전체 제품 구조를 먼저 맞추기 위해
                  카드형 선택 영역 + 메인 플레이 패널 + 우측 보조 패널 레이아웃을 먼저 잡아둔 상태예요.
                </p>
              </div>
            )}
          </article>

          <aside style={{ display: "grid", gap: 20 }}>
            <article
              style={{
                background: "var(--panel-strong)",
                border: "1px solid var(--line)",
                borderRadius: 28,
                padding: 24,
              }}
            >
              <p style={{ color: "var(--muted)", marginTop: 0 }}>설계 메모</p>
              <h3 style={{ margin: "8px 0 14px" }}>페이지 구조</h3>
              <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.8, marginBottom: 0 }}>
                <li>상단: 서비스 소개 + 현재 상태</li>
                <li>중단: 3개 모드 카드 선택</li>
                <li>하단 좌측: 선택 모드 메인 플레이 영역</li>
                <li>하단 우측: 룰 / 진행상태 / 향후 확장 정보</li>
              </ul>
            </article>

            <article
              style={{
                background: "var(--panel-strong)",
                border: "1px solid var(--line)",
                borderRadius: 28,
                padding: 24,
                color: "var(--muted)",
              }}
            >
              <p style={{ color: "var(--muted)", marginTop: 0 }}>측정 규칙</p>
              <ul style={{ paddingLeft: 20, marginBottom: 0, lineHeight: 1.8 }}>
                <li>A와 L 키만 측정합니다.</li>
                <li>반드시 좌우 교대로 입력해야 valid hit로 인정됩니다.</li>
                <li>같은 키를 연속으로 누르면 invalid hit로 기록되고 스트릭이 끊깁니다.</li>
                <li>도전/연습 모드는 같은 레이아웃 안에서 다른 판정 로직만 교체하면 되게 설계했어요.</li>
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        padding: "14px 16px",
        borderRadius: 16,
        border: "1px solid var(--line)",
        background: "rgba(255, 255, 255, 0.02)",
      }}
    >
      <span style={{ color: "var(--muted)", fontSize: 14 }}>{label}</span>
      <strong style={{ fontSize: 22 }}>{value}</strong>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
        padding: "12px 14px",
        borderRadius: 16,
        border: "1px solid var(--line)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
