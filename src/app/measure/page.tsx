"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendMeasureHistory,
  createMeasureHistoryEntry,
  formatMs,
  formatPercent,
  type MeasureResult as Result,
  type MeasureVariant,
} from "../lib/measure-history";

type SessionState = "idle" | "countdown" | "running" | "finished";
type KeyCaptureTarget = "primary" | "secondary" | null;

type MeasurePreset = {
  key: MeasureVariant;
  title: string;
  description: string;
  defaultKeys: [string, string];
};

const COUNTDOWN_SECONDS = 3;
const TEST_SECONDS = 10;
const FORBIDDEN_CAPTURE_KEYS = new Set(["ESC", "TAB", "ENTER", "CMD", "CTRL", "ALT", "SHIFT"]);

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

function calculate일정함Score(intervals: number[]) {
  if (intervals.length <= 1) return 100;

  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  if (average <= 0) return 100;

  const variance = intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length;
  const standardDeviation = Math.sqrt(variance);
  return Math.max(0, Math.round(100 - (standardDeviation / average) * 100));
}

function normalizeKey(value: string) {
  if (value === " ") return "SPACE";
  if (value === "Escape") return "ESC";
  if (value === "ArrowUp") return "↑";
  if (value === "ArrowDown") return "↓";
  if (value === "ArrowLeft") return "←";
  if (value === "ArrowRight") return "→";
  if (value === "Control") return "CTRL";
  if (value === "Shift") return "SHIFT";
  if (value === "Alt") return "ALT";
  if (value === "Meta") return "CMD";
  if (value === "Enter") return "ENTER";
  if (value === "Tab") return "TAB";
  if (value === "Backspace") return "BACKSPACE";
  return value.trim().toUpperCase();
}

function normalizeKeyboardEvent(event: KeyboardEvent) {
  const { code, key } = event;

  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "SPACE";
  if (code === "Escape") return "ESC";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code === "ControlLeft" || code === "ControlRight") return "CTRL";
  if (code === "ShiftLeft" || code === "ShiftRight") return "SHIFT";
  if (code === "AltLeft" || code === "AltRight") return "ALT";
  if (code === "MetaLeft" || code === "MetaRight") return "CMD";
  if (code === "Enter" || code === "NumpadEnter") return "ENTER";
  if (code === "Tab") return "TAB";
  if (code === "Backspace") return "BACKSPACE";
  if (code.startsWith("Numpad")) return code.replace("Numpad", "NUM ").toUpperCase();

  return normalizeKey(key);
}

function getPresetConfig(variant: MeasureVariant) {
  return MEASURE_PRESETS.find((preset) => preset.key === variant) ?? MEASURE_PRESETS[0];
}

export default function MeasurePage() {
  const [measureVariant, setMeasureVariant] = useState<MeasureVariant>("both");
  const [primaryKey, setPrimaryKey] = useState("A");
  const [secondaryKey, setSecondaryKey] = useState("L");
  const [keyCaptureTarget, setKeyCaptureTarget] = useState<KeyCaptureTarget>(null);
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
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [activePad, setActivePad] = useState<"primary" | "secondary" | null>(null);
  const [hitFeedback, setHitFeedback] = useState<"good" | "miss" | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const validHitsRef = useRef(0);
  const invalidHitsRef = useRef(0);
  const peakStreakRef = useRef(0);
  const acceptedTimestampsRef = useRef<number[]>([]);
  const activePadTimeoutRef = useRef<number | null>(null);
  const hitFeedbackTimeoutRef = useRef<number | null>(null);

  const activePreset = getPresetConfig(measureVariant);
  const configuredKeys = useMemo(() => [normalizeKey(primaryKey), normalizeKey(secondaryKey)], [primaryKey, secondaryKey]);
  const hasValidKeyConfig = configuredKeys[0].length > 0 && configuredKeys[1].length > 0 && configuredKeys[0] !== configuredKeys[1];

  const helperText = useMemo(() => {
    if (keyCaptureTarget) {
      return keyCaptureTarget === "primary"
        ? "첫 번째 키를 기다리는 중이에요. 아무 키나 눌러주세요. ESC로 취소할 수 있어요."
        : "두 번째 키를 기다리는 중이에요. 아무 키나 눌러주세요. ESC로 취소할 수 있어요.";
    }

    if (captureError) return captureError;
    if (!hasValidKeyConfig) return "서로 다른 두 키를 설정해야 측정을 시작할 수 있어요.";
    if (sessionState === "countdown") return `준비... ${countdownLeft}초 후 측정 시작`;
    if (sessionState === "running") return `${configuredKeys[0]} 와 ${configuredKeys[1]} 키만 사용해서 정확히 번갈아 누르세요.`;
    if (result) return "같은 키 반복은 invalid 처리돼요. 정확도를 유지하면서 BPM을 끌어올리는 게 핵심이에요.";
    return `${activePreset.title} 기준 · ${configuredKeys[0]} / ${configuredKeys[1]}`;
  }, [activePreset.title, captureError, configuredKeys, countdownLeft, hasValidKeyConfig, keyCaptureTarget, result, sessionState]);

  const triggerPadFeedback = useCallback((target: "primary" | "secondary") => {
    if (activePadTimeoutRef.current) {
      window.clearTimeout(activePadTimeoutRef.current);
    }

    setActivePad(target);
    activePadTimeoutRef.current = window.setTimeout(() => {
      setActivePad(null);
      activePadTimeoutRef.current = null;
    }, 120);
  }, []);

  const triggerHitFeedback = useCallback((type: "good" | "miss") => {
    if (hitFeedbackTimeoutRef.current) {
      window.clearTimeout(hitFeedbackTimeoutRef.current);
    }

    setHitFeedback(type);
    hitFeedbackTimeoutRef.current = window.setTimeout(() => {
      setHitFeedback(null);
      hitFeedbackTimeoutRef.current = null;
    }, 180);
  }, []);

  const finishRun = useCallback(() => {
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("finished");

    const totalHits = validHitsRef.current + invalidHitsRef.current;
    const accuracy = totalHits === 0 ? 0 : (validHitsRef.current / totalHits) * 100;
    const bpm = Math.round((validHitsRef.current / 4 / TEST_SECONDS) * 60);
    const intervals = acceptedTimestampsRef.current.slice(1).map((timestamp, index) => timestamp - acceptedTimestampsRef.current[index]);
    const averageIntervalMs = intervals.length > 0 ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
    const fastestIntervalMs = intervals.length > 0 ? Math.min(...intervals) : null;
    const slowestIntervalMs = intervals.length > 0 ? Math.max(...intervals) : null;
    const consistencyScore = calculate일정함Score(intervals);

    setResult({
      bpm,
      validHits: validHitsRef.current,
      invalidHits: invalidHitsRef.current,
      accuracy,
      peakStreak: peakStreakRef.current,
      averageIntervalMs,
      fastestIntervalMs,
      slowestIntervalMs,
      consistencyScore,
      intervals,
    });
  }, []);

  const resetStats = useCallback(() => {
    setCountdownLeft(COUNTDOWN_SECONDS);
    setTimeLeft(TEST_SECONDS);
    setLastAcceptedKey(null);
    setLatestInput("-");
    setValidHits(0);
    setInvalidHits(0);
    setCurrentStreak(0);
    setPeakStreak(0);
    setResult(null);
    setCaptureError(null);
    setActivePad(null);
    setHitFeedback(null);
    deadlineRef.current = null;
    runningRef.current = false;
    validHitsRef.current = 0;
    invalidHitsRef.current = 0;
    peakStreakRef.current = 0;
    acceptedTimestampsRef.current = [];
  }, []);

  useEffect(() => {
    if (sessionState !== "countdown") return;

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
    return () => {
      if (activePadTimeoutRef.current) window.clearTimeout(activePadTimeoutRef.current);
      if (hitFeedbackTimeoutRef.current) window.clearTimeout(hitFeedbackTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "running") return;

    const interval = window.setInterval(() => {
      if (!deadlineRef.current) return;
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
    if (!result || sessionState !== "finished") return;

    appendMeasureHistory(
      createMeasureHistoryEntry({
        variant: measureVariant,
        primaryKey: configuredKeys[0],
        secondaryKey: configuredKeys[1],
        result,
      }),
    );
  }, [configuredKeys, measureVariant, result, sessionState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (keyCaptureTarget) {
        event.preventDefault();
        if (event.key === "Escape") {
          setKeyCaptureTarget(null);
          setCaptureError(null);
          return;
        }

        const pressedKey = normalizeKeyboardEvent(event);
        if (!pressedKey) return;
        if (FORBIDDEN_CAPTURE_KEYS.has(pressedKey)) {
          setCaptureError(`${pressedKey} 키는 바인딩할 수 없어요. 다른 키를 눌러주세요.`);
          return;
        }

        setCaptureError(null);
        if (keyCaptureTarget === "primary") setPrimaryKey(pressedKey);
        else setSecondaryKey(pressedKey);
        setKeyCaptureTarget(null);
        runningRef.current = false;
        deadlineRef.current = null;
        setSessionState("idle");
        resetStats();
        return;
      }

      const pressedKey = normalizeKeyboardEvent(event);
      if (!pressedKey) return;
      if (!runningRef.current || !hasValidKeyConfig || !configuredKeys.includes(pressedKey)) return;

      event.preventDefault();
      setLatestInput(pressedKey);

      if (lastAcceptedKey === null || lastAcceptedKey !== pressedKey) {
        const target = pressedKey === configuredKeys[0] ? "primary" : "secondary";
        triggerPadFeedback(target);
        triggerHitFeedback("good");
        acceptedTimestampsRef.current = [...acceptedTimestampsRef.current, performance.now()];
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

      triggerHitFeedback("miss");
      setInvalidHits((current) => {
        const next = current + 1;
        invalidHitsRef.current = next;
        return next;
      });
      setCurrentStreak(0);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [configuredKeys, hasValidKeyConfig, keyCaptureTarget, lastAcceptedKey, resetStats, triggerHitFeedback, triggerPadFeedback]);

  function startRun() {
    if (!hasValidKeyConfig || keyCaptureTarget !== null) return;
    resetStats();
    setSessionState("countdown");
  }

  function applyPreset(variant: MeasureVariant) {
    const preset = getPresetConfig(variant);
    setMeasureVariant(variant);
    setPrimaryKey(preset.defaultKeys[0]);
    setSecondaryKey(preset.defaultKeys[1]);
    setKeyCaptureTarget(null);
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("idle");
    resetStats();
  }

  function beginKeyCapture(target: Exclude<KeyCaptureTarget, null>) {
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("idle");
    setCaptureError(null);
    setKeyCaptureTarget(target);
    resetStats();
  }

  const statusLabel =
    sessionState === "countdown"
      ? `카운트다운 ${countdownLeft}`
      : sessionState === "running"
        ? `측정 중 ${timeLeft.toFixed(1)}초`
        : sessionState === "finished"
          ? "측정 완료"
          : keyCaptureTarget
            ? "키 대기 중"
            : "준비 완료";

  return (
    <main className="page-main measure-page">
      {sessionState === "countdown" ? (
        <div className="countdown-overlay" aria-live="assertive">
          <div className="countdown-overlay-inner">
            <span className="countdown-caption">준비</span>
            <strong className="countdown-value">{countdownLeft}</strong>
          </div>
        </div>
      ) : null}

      <section className="page-section compact-hero">
        <h1 className="page-title">측정 모드</h1>
        <div className="status-pill">{statusLabel}</div>
      </section>

      <section className="page-section compact-summary panel">
        <strong>{activePreset.title}</strong>
        <span className="compact-summary-divider">·</span>
        <span>{configuredKeys[0]} / {configuredKeys[1]}</span>
        <span className="compact-summary-divider">·</span>
        <span>{helperText}</span>
      </section>

      <section className="measure-grid">
        <article className="panel stack-gap-lg start-panel">
          <div>
            <p className="section-label">모드 선택</p>
            <div className="preset-grid">
              {MEASURE_PRESETS.map((preset) => {
                const isActive = preset.key === measureVariant;
                return (
                  <button
                    key={preset.key}
                    onClick={() => applyPreset(preset.key)}
                    disabled={sessionState === "countdown" || sessionState === "running"}
                    className={`preset-card ${isActive ? "is-active" : ""}`}
                  >
                    <strong>{preset.title}</strong>
                    <span>{preset.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="section-label">키</p>
            <div className="key-grid">
              <KeySettingCard
                label="첫 번째 키"
                value={primaryKey}
                hint={measureVariant === "left" ? "예: A" : measureVariant === "right" ? "예: K" : "예: A"}
                isCapturing={keyCaptureTarget === "primary"}
                onStartCapture={() => beginKeyCapture("primary")}
                disabled={sessionState === "countdown" || sessionState === "running"}
              />
              <KeySettingCard
                label="두 번째 키"
                value={secondaryKey}
                hint={measureVariant === "left" ? "예: S" : measureVariant === "right" ? "예: L" : "예: L"}
                isCapturing={keyCaptureTarget === "secondary"}
                onStartCapture={() => beginKeyCapture("secondary")}
                disabled={sessionState === "countdown" || sessionState === "running"}
              />
            </div>
            <p className={`inline-note ${captureError || !hasValidKeyConfig ? "is-danger" : ""}`}>
              {captureError ?? (hasValidKeyConfig ? `현재 ${configuredKeys[0]} / ${configuredKeys[1]} 조합으로 측정해요.` : "서로 다른 두 키를 입력해야 측정을 시작할 수 있어요.")}
            </p>
          </div>

          <div className="start-button-wrap">
            <button
              onClick={startRun}
              disabled={sessionState === "countdown" || sessionState === "running" || !hasValidKeyConfig || keyCaptureTarget !== null}
              className="primary-button primary-button-large"
            >
              {result ? "다시 측정하기" : "측정 시작"}
            </button>
          </div>
        </article>

        <aside className="stack-gap-lg meter-sidebar">
          <article className={`panel rhythm-panel ${hitFeedback === "miss" ? "is-miss" : ""}`}>
            <div className="rhythm-stage compact-rhythm-stage">
              <div className="combo-display compact-combo-display">
                <div>
                  <span className="combo-label">스트릭</span>
                  <strong className="combo-value compact-combo-value">{currentStreak}</strong>
                </div>
                <span className={`hit-badge ${hitFeedback ? `is-${hitFeedback}` : ""}`}>
                  {hitFeedback === "good" ? "성공" : hitFeedback === "miss" ? "실수" : "준비 완료"}
                </span>
              </div>
              <div className="pad-grid compact-pad-grid">
                <RhythmPad label="왼쪽" value={configuredKeys[0]} isActive={activePad === "primary"} compact />
                <RhythmPad label="오른쪽" value={configuredKeys[1]} isActive={activePad === "secondary"} compact />
              </div>
            </div>
          </article>

          <article className="panel stat-grid compact-stat-grid">
            <Stat label="마지막 입력" value={latestInput} />
            <Stat label="유효 입력" value={String(validHits)} />
            <Stat label="무효 입력" value={String(invalidHits)} />
            <Stat label="현재 스트릭" value={String(currentStreak)} />
            <Stat label="최대 스트릭" value={String(peakStreak)} />
          </article>
        </aside>
      </section>

      <section className="page-section result-section">
        <article className="panel result-panel stack-gap-lg">
          <div>
            <p className="section-label">결과</p>
            <h2 className="result-title">{result ? `${result.bpm} BPM` : "-"}</h2>
            <p className="section-subtitle">
              {result
                ? `정확도 ${formatPercent(result.accuracy)} · 유효 ${result.validHits} · 무효 ${result.invalidHits} · 최대 스트릭 ${result.peakStreak}`
                : "측정 전"}
            </p>
          </div>

          <div className="interval-stats-grid">
            <Stat label="평균 간격" value={result ? formatMs(result.averageIntervalMs) : "-"} />
            <Stat label="최고 속도" value={result ? formatMs(result.fastestIntervalMs) : "-"} />
            <Stat label="최저 속도" value={result ? formatMs(result.slowestIntervalMs) : "-"} />
            <Stat label="일정함" value={result ? `${result.consistencyScore}%` : "-"} />
          </div>

          <div className="interval-chart-wrap">
            <p className="section-label">간격 그래프</p>
            {result && result.intervals.length > 1 ? (
              <>
                <IntervalChart intervals={result.intervals} />
                <p className="section-subtitle">선이 평평할수록 더 일정한 트릴이에요.</p>
              </>
            ) : (
              <p className="section-subtitle">유효 입력이 더 쌓이면 간격 그래프가 표시돼요.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RhythmPad({
  label,
  value,
  isActive,
  compact = false,
}: {
  label: string;
  value: string;
  isActive: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`rhythm-pad ${compact ? "is-compact" : ""} ${isActive ? "is-active" : ""}`}>
      <span className="rhythm-pad-label">{label}</span>
      <strong className="rhythm-pad-value">{value}</strong>
    </div>
  );
}

function IntervalChart({ intervals }: { intervals: number[] }) {
  const width = 640;
  const height = 220;
  const padding = 18;
  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  const range = Math.max(max - min, 1);

  const points = intervals
    .map((value, index) => {
      const x = padding + (index / Math.max(intervals.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const averageY = height - padding - ((average - min) / range) * (height - padding * 2);

  return (
    <div className="interval-chart">
      <svg viewBox={`0 0 ${width} ${height}`} className="interval-chart-svg" role="img" aria-label="입력 간격 그래프">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} className="chart-axis" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="chart-axis" />
        <line x1={padding} y1={averageY} x2={width - padding} y2={averageY} className="chart-average-line" />
        <polyline fill="none" points={points} className="chart-line" />
        {intervals.map((value, index) => {
          const x = padding + (index / Math.max(intervals.length - 1, 1)) * (width - padding * 2);
          const y = height - padding - ((value - min) / range) * (height - padding * 2);
          return <circle key={`${index}-${value}`} cx={x} cy={y} r="4" className="chart-point" />;
        })}
      </svg>
      <div className="chart-meta">
        <span>최고 속도 {Math.round(min)} ms</span>
        <span>평균 {Math.round(average)} ms</span>
        <span>최저 속도 {Math.round(max)} ms</span>
      </div>
    </div>
  );
}

function KeySettingCard({
  label,
  value,
  hint,
  isCapturing,
  onStartCapture,
  disabled,
}: {
  label: string;
  value: string;
  hint: string;
  isCapturing: boolean;
  onStartCapture: () => void;
  disabled: boolean;
}) {
  return (
    <div className={`key-card ${isCapturing ? "is-capturing" : ""}`}>
      <span className="key-label">{label}</span>
      <div className="key-value">{normalizeKey(value) || "-"}</div>
      <button type="button" onClick={onStartCapture} disabled={disabled} className="secondary-button">
        {isCapturing ? "아무 키나 눌러주세요..." : "키 변경하기"}
      </button>
      <span className="hint-text">
        {isCapturing ? "다음 키 입력을 바로 이 슬롯에 저장해요. ESC로 취소할 수 있어요. ESC/TAB/ENTER/수정키는 사용할 수 없어요." : hint}
      </span>
    </div>
  );
}
