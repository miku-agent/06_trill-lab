"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SessionState = "idle" | "countdown" | "running" | "finished";
type ModeKey = "measure" | "challenge" | "practice";
type MeasureVariant = "left" | "right" | "both";

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

type MeasurePreset = {
  key: MeasureVariant;
  title: string;
  description: string;
  defaultKeys: [string, string];
};

const COUNTDOWN_SECONDS = 3;
const TEST_SECONDS = 10;

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

const MEASURE_PRESETS: MeasurePreset[] = [
  {
    key: "left",
    title: "왼손 모드",
    description: "왼손 두 키로 한손 트릴을 측정해요.",
    defaultKeys: ["A", "S"],
  },
  {
    key: "right",
    title: "오른손 모드",
    description: "오른손 두 키로 한손 트릴을 측정해요.",
    defaultKeys: ["K", "L"],
  },
  {
    key: "both",
    title: "양손 모드",
    description: "좌/우 손 분리 키로 일반적인 교대 트릴을 측정해요.",
    defaultKeys: ["A", "L"],
  },
];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function normalizeKey(value: string) {
  return value.trim().slice(0, 1).toUpperCase();
}

function getPresetConfig(variant: MeasureVariant) {
  return MEASURE_PRESETS.find((preset) => preset.key === variant) ?? MEASURE_PRESETS[0];
}

export default function HomePage() {
  const [selectedMode, setSelectedMode] = useState<ModeKey>("measure");
  const [measureVariant, setMeasureVariant] = useState<MeasureVariant>("both");
  const [primaryKey, setPrimaryKey] = useState("A");
  const [secondaryKey, setSecondaryKey] = useState("L");
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [countdownLeft, setCountdownLeft] = useState(COUNTDOWN_SECONDS);
  const [timeLeft, setTimeLeft] = useState(TEST_SECONDS);
  const [lastAcceptedKey, setLastAcceptedKey] = useState<string | null>(null);
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
  const activePreset = getPresetConfig(measureVariant);
  const configuredKeys = useMemo(() => [normalizeKey(primaryKey), normalizeKey(secondaryKey)], [primaryKey, secondaryKey]);
  const hasValidKeyConfig = configuredKeys[0].length > 0 && configuredKeys[1].length > 0 && configuredKeys[0] !== configuredKeys[1];

  const helperText = useMemo(() => {
    if (selectedMode !== "measure") {
      return "이 모드는 아직 레이아웃만 잡혀 있어요. 먼저 측정 모드로 감을 확인해보세요.";
    }

    if (!hasValidKeyConfig) {
      return "서로 다른 두 키를 설정해야 측정을 시작할 수 있어요.";
    }

    if (sessionState === "countdown") {
      return `준비... ${countdownLeft}초 후 측정 시작`;
    }

    if (sessionState === "running") {
      return `${configuredKeys[0]} 와 ${configuredKeys[1]} 키만 사용해서 정확히 번갈아 누르세요.`;
    }

    if (result) {
      return "같은 키 반복은 invalid 처리돼요. 정확도를 유지하면서 BPM을 끌어올리는 게 핵심이에요.";
    }

    return `${activePreset.title} 기준으로 ${configuredKeys[0]} / ${configuredKeys[1]} 키를 사용합니다. 10초 동안 한계 속도로 트릴을 쳐보세요.`;
  }, [activePreset.title, configuredKeys, countdownLeft, hasValidKeyConfig, result, selectedMode, sessionState]);

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
      const pressedKey = normalizeKey(event.key);
      if (!runningRef.current || !hasValidKeyConfig || !configuredKeys.includes(pressedKey)) {
        return;
      }

      event.preventDefault();
      setLatestInput(pressedKey);

      if (lastAcceptedKey === null || lastAcceptedKey !== pressedKey) {
        setLastAcceptedKey(pressedKey);
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
  }, [configuredKeys, hasValidKeyConfig, lastAcceptedKey]);

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
    if (selectedMode !== "measure" || !hasValidKeyConfig) {
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

  function applyPreset(variant: MeasureVariant) {
    const preset = getPresetConfig(variant);
    setMeasureVariant(variant);
    setPrimaryKey(preset.defaultKeys[0]);
    setSecondaryKey(preset.defaultKeys[1]);
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("idle");
    resetStats();
  }

  function updatePrimaryKey(value: string) {
    setPrimaryKey(normalizeKey(value));
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("idle");
    resetStats();
  }

  function updateSecondaryKey(value: string) {
    setSecondaryKey(normalizeKey(value));
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
                이제 측정 모드는 단순 A/L 고정이 아니라, <strong>왼손 / 오른손 / 양손</strong>으로 세분화되고 원하는 키로 직접
                맞출 수 있어요. 먼저 손 세팅을 고르고, 그 다음 실제 한계 BPM을 재는 흐름으로 다듬었습니다.
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
                <QuickStat label="측정 세부 모드" value={activePreset.title} />
                <QuickStat label="사용 키" value={`${configuredKeys[0] || "_"} / ${configuredKeys[1] || "_"}`} />
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
                <div
                  style={{
                    borderRadius: 22,
                    padding: 20,
                    border: "1px solid var(--line)",
                    background: "rgba(255,255,255,0.02)",
                    display: "grid",
                    gap: 18,
                  }}
                >
                  <div>
                    <p style={{ color: "var(--muted)", marginTop: 0 }}>손 세부 모드</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                      {MEASURE_PRESETS.map((preset) => {
                        const isActive = preset.key === measureVariant;

                        return (
                          <button
                            key={preset.key}
                            onClick={() => applyPreset(preset.key)}
                            disabled={sessionState === "countdown" || sessionState === "running"}
                            style={{
                              textAlign: "left",
                              borderRadius: 18,
                              border: isActive ? "1px solid rgba(100, 245, 231, 0.7)" : "1px solid var(--line)",
                              background: isActive ? "rgba(57, 197, 187, 0.12)" : "rgba(255,255,255,0.02)",
                              color: "var(--text)",
                              padding: 16,
                              cursor: "pointer",
                            }}
                          >
                            <strong style={{ display: "block", marginBottom: 8 }}>{preset.title}</strong>
                            <span style={{ color: "var(--muted)", lineHeight: 1.6 }}>{preset.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p style={{ color: "var(--muted)", marginTop: 0 }}>키 설정</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                      <KeySettingCard
                        label="첫 번째 키"
                        value={primaryKey}
                        hint={measureVariant === "left" ? "예: A" : measureVariant === "right" ? "예: K" : "예: A"}
                        onChange={updatePrimaryKey}
                        disabled={sessionState === "countdown" || sessionState === "running"}
                      />
                      <KeySettingCard
                        label="두 번째 키"
                        value={secondaryKey}
                        hint={measureVariant === "left" ? "예: S" : measureVariant === "right" ? "예: L" : "예: L"}
                        onChange={updateSecondaryKey}
                        disabled={sessionState === "countdown" || sessionState === "running"}
                      />
                    </div>
                    <p style={{ color: hasValidKeyConfig ? "var(--muted)" : "var(--danger)", marginBottom: 0, marginTop: 12 }}>
                      {hasValidKeyConfig
                        ? `현재 ${configuredKeys[0]} / ${configuredKeys[1]} 조합으로 측정해요.`
                        : "서로 다른 두 키를 입력해야 측정을 시작할 수 있어요."}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={startRun}
                    disabled={sessionState === "countdown" || sessionState === "running" || !hasValidKeyConfig}
                    style={{
                      border: 0,
                      borderRadius: 16,
                      padding: "14px 18px",
                      background: "linear-gradient(135deg, var(--accent), var(--accent-strong))",
                      color: "#062127",
                      fontWeight: 800,
                      cursor: hasValidKeyConfig ? "pointer" : "not-allowed",
                      opacity: hasValidKeyConfig ? 1 : 0.5,
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
                      ? `${activePreset.title} · ${configuredKeys[0]} / ${configuredKeys[1]} · 정확도 ${formatPercent(result.accuracy)} · 유효 ${result.validHits} · 무효 ${result.invalidHits} · 최대 스트릭 ${result.peakStreak}`
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
              <h3 style={{ margin: "8px 0 14px" }}>측정 모드 개편 포인트</h3>
              <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.8, marginBottom: 0 }}>
                <li>왼손 / 오른손 / 양손을 독립 preset으로 분리</li>
                <li>preset 선택 후 키 바인딩 수동 수정 가능</li>
                <li>입력 키가 겹치면 측정 시작 비활성화</li>
                <li>이후 도전/연습 모드도 같은 키 세팅 구조를 재사용 가능</li>
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
                <li>설정한 두 키만 측정합니다.</li>
                <li>반드시 두 키를 번갈아 입력해야 valid hit로 인정됩니다.</li>
                <li>같은 키를 연속으로 누르면 invalid hit로 기록되고 스트릭이 끊깁니다.</li>
                <li>키 설정을 바꾸면 현재 세션은 초기화돼요.</li>
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

function KeySettingCard({
  label,
  value,
  hint,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  hint: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: 10,
        padding: 16,
        borderRadius: 18,
        border: "1px solid var(--line)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={hint}
        maxLength={1}
        style={{
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "rgba(7, 19, 26, 0.9)",
          color: "var(--text)",
          padding: "12px 14px",
          outline: "none",
          fontSize: 20,
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      />
      <span style={{ color: "var(--muted)", fontSize: 13 }}>{hint}</span>
    </label>
  );
}
