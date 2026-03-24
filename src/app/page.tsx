"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HandKey = "A" | "L";
type SessionState = "idle" | "countdown" | "running" | "finished";

type Result = {
  bpm: number;
  validHits: number;
  invalidHits: number;
  accuracy: number;
  peakStreak: number;
};

const COUNTDOWN_SECONDS = 3;
const TEST_SECONDS = 10;
const ACCEPTED_KEYS: HandKey[] = ["A", "L"];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export default function HomePage() {
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

  const helperText = useMemo(() => {
    if (sessionState === "countdown") {
      return `준비... ${countdownLeft}초 후 측정 시작`;
    }

    if (sessionState === "running") {
      return "A와 L만 사용해서 정확히 번갈아 누르세요.";
    }

    if (result) {
      return "같은 손가락 반복은 invalid 처리돼요. 더 높은 정확도로 다시 도전해보세요.";
    }

    return "키보드 A / L 교대 입력만 인정합니다. 10초 동안 한계 속도로 트릴을 쳐보세요.";
  }, [countdownLeft, result, sessionState]);

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
    resetStats();
    setSessionState("countdown");
  }

  const statusTone =
    sessionState === "running"
      ? "running"
      : sessionState === "finished"
        ? "finished"
        : "idle";

  return (
    <main style={{ display: "grid", placeItems: "center", padding: "32px 16px" }}>
      <div
        style={{
          width: "min(920px, 100%)",
          display: "grid",
          gap: 20,
        }}
      >
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 24,
            padding: 28,
            backdropFilter: "blur(18px)",
            boxShadow: "0 20px 80px rgba(0, 0, 0, 0.28)",
          }}
        >
          <p style={{ color: "var(--accent-strong)", margin: 0, fontWeight: 700, letterSpacing: "0.08em" }}>
            TRILL LAB / MVP
          </p>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 4rem)", margin: "10px 0 12px" }}>
            16비트 트릴 한계 BPM 측정기
          </h1>
          <p style={{ color: "var(--muted)", margin: 0, maxWidth: 720, lineHeight: 1.7 }}>
            리듬게임에서 자주 마주치는 좌우 교대 트릴을 10초 동안 측정합니다. A / L 입력만 인정하고,
            같은 키 연타는 invalid로 처리해요. 결과 BPM은 <strong>16분음표 기준</strong>으로 계산됩니다.
          </p>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          <article
            style={{
              background: "var(--panel-strong)",
              border: "1px solid var(--line)",
              borderRadius: 24,
              padding: 24,
            }}
          >
            <p style={{ color: "var(--muted)", marginTop: 0 }}>상태</p>
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
              }}
            >
              {sessionState === "countdown"
                ? `COUNTDOWN ${countdownLeft}`
                : sessionState === "running"
                  ? `RUNNING ${timeLeft.toFixed(1)}s`
                  : sessionState === "finished"
                    ? "FINISHED"
                    : "READY"}
            </div>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: 20 }}>{helperText}</p>
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
          </article>

          <article
            style={{
              background: "var(--panel-strong)",
              border: "1px solid var(--line)",
              borderRadius: 24,
              padding: 24,
              display: "grid",
              gap: 12,
            }}
          >
            <Stat label="마지막 입력" value={latestInput} />
            <Stat label="유효 입력" value={String(validHits)} />
            <Stat label="무효 입력" value={String(invalidHits)} />
            <Stat label="현재 스트릭" value={String(currentStreak)} />
            <Stat label="최대 스트릭" value={String(peakStreak)} />
          </article>
        </section>

        <section
          style={{
            background: "var(--panel-strong)",
            border: "1px solid var(--line)",
            borderRadius: 24,
            padding: 24,
            display: "grid",
            gap: 12,
          }}
        >
          <p style={{ color: "var(--muted)", margin: 0 }}>결과</p>
          <h2 style={{ margin: 0, fontSize: "clamp(1.6rem, 4vw, 2.8rem)" }}>
            {result ? `현재 기록: 16비트 트릴 기준 ${result.bpm} BPM` : "아직 기록이 없어요"}
          </h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            {result
              ? `정확도 ${formatPercent(result.accuracy)} · 유효 ${result.validHits} · 무효 ${result.invalidHits} · 최대 스트릭 ${result.peakStreak}`
              : "측정이 끝나면 BPM/정확도/스트릭이 함께 표시됩니다."}
          </p>
        </section>

        <section
          style={{
            background: "var(--panel-strong)",
            border: "1px solid var(--line)",
            borderRadius: 24,
            padding: 24,
            lineHeight: 1.8,
            color: "var(--muted)",
          }}
        >
          <h3 style={{ color: "var(--text)", marginTop: 0 }}>측정 규칙</h3>
          <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
            <li>A와 L 키만 측정합니다.</li>
            <li>반드시 좌우 교대로 입력해야 valid hit로 인정됩니다.</li>
            <li>같은 키를 연속으로 누르면 invalid hit로 기록되고 스트릭이 끊깁니다.</li>
            <li>현재 MVP는 키보드 기준 측정기예요. 향후 패턴 모드/랭킹/차트는 확장 가능하게 열어뒀습니다.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "center",
        padding: "12px 14px",
        borderRadius: 16,
        border: "1px solid var(--line)",
        background: "rgba(255, 255, 255, 0.02)",
      }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
