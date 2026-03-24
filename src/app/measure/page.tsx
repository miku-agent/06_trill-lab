"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  appendMeasureHistory,
  createMeasureHistoryEntry,
  formatMs,
  formatPercent,
  type MeasureResult as Result,
  type MeasureVariant,
} from "../lib/measure-history";
import { getPatternDefinition, type PatternKey } from "../lib/patterns";

type SessionState = "idle" | "countdown" | "running" | "finished";
type KeyCaptureTarget = "key1" | "key2" | "key3" | "key4" | null;
type MeasurePreset = {
  key: MeasureVariant;
  title: string;
  description: string;
  defaultKeys: [string, string];
};

type PatternMode = {
  key: PatternKey;
  title: string;
  description: string;
  keyLabels: string[];
  keyHints: string[];
  sequence: (keys: string[], variant: MeasureVariant) => string[];
};

const COUNTDOWN_SECONDS = 3;
const TEST_SECONDS = 10;
const FORBIDDEN_CAPTURE_KEYS = new Set(["ESC", "TAB", "ENTER", "CMD", "CTRL", "ALT", "SHIFT"]);
const CAPTURE_TARGETS: Exclude<KeyCaptureTarget, null>[] = ["key1", "key2", "key3", "key4"];

const MEASURE_PRESETS: MeasurePreset[] = [
  { key: "left", title: "왼손 모드", description: "왼손 두 키로 한손 트릴을 측정해요.", defaultKeys: ["A", "S"] },
  { key: "right", title: "오른손 모드", description: "오른손 두 키로 한손 트릴을 측정해요.", defaultKeys: ["K", "L"] },
  { key: "both", title: "양손 모드", description: "좌/우 손 분리 키로 일반적인 교대 트릴을 측정해요.", defaultKeys: ["A", "L"] },
];

const DRURUK_PRESETS: MeasurePreset[] = [
  { key: "1234", title: "1234 모드", description: "A → S → ; → ' 순서로 입력해요.", defaultKeys: ["A", "S"] },
  { key: "4321", title: "4321 모드", description: "' → ; → S → A 순서로 입력해요.", defaultKeys: ["'", ";"] },
];

const PATTERN_MODES: Record<PatternKey, PatternMode> = {
  trill: {
    key: "trill",
    title: "트릴 측정",
    description: "두 키를 번갈아 눌러 BPM과 일정함을 측정해요.",
    keyLabels: ["첫 번째 키", "두 번째 키"],
    keyHints: ["예: A", "예: L"],
    sequence: (keys) => [keys[0], keys[1]],
  },
  druruk: {
    key: "druruk",
    title: "드르륵 측정",
    description: "1234 또는 4321 한 방향 패턴으로 4키 입력 속도와 안정감을 측정해요.",
    keyLabels: ["1번 키", "2번 키", "3번 키", "4번 키"],
    keyHints: ["예: A", "예: S", "예: ;", "예: '"],
    sequence: (keys) => [keys[0], keys[1], keys[2], keys[3]],
  },
  yeonta: {
    key: "yeonta",
    title: "연타 측정",
    description: "A / S / ; / ' 를 각각 4연타씩 반복하는 패턴을 측정해요.",
    keyLabels: ["1번 키", "2번 키", "3번 키", "4번 키"],
    keyHints: ["예: A", "예: S", "예: ;", "예: '"],
    sequence: (keys) => [keys[0], keys[0], keys[0], keys[0], keys[1], keys[1], keys[1], keys[1], keys[2], keys[2], keys[2], keys[2], keys[3], keys[3], keys[3], keys[3]],
  },
};

function calculateConsistencyScore(intervals: number[]) {
  if (intervals.length <= 1) return 100;
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  if (average <= 0) return 100;
  const variance = intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length;
  const standardDeviation = Math.sqrt(variance);
  return Math.max(0, Math.round(100 - (standardDeviation / average) * 100));
}

function calculateAverage(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateStandardDeviation(values: number[]) {
  const average = calculateAverage(values);
  if (average === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
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

function getPresetConfig(variant: MeasureVariant, pattern: PatternKey) {
  const presets = pattern === "druruk" ? DRURUK_PRESETS : MEASURE_PRESETS;
  return presets.find((preset) => preset.key === variant) ?? presets[0];
}

function getDefaultKeys(pattern: PatternKey, variant: MeasureVariant, activePreset: MeasurePreset) {
  if (pattern === "yeonta") {
    return ["A", "S", ";", "'"] as [string, string, string, string];
  }

  if (pattern === "druruk") {
    return variant === "4321"
      ? (["'", ";", "S", "A"] as [string, string, string, string])
      : (["A", "S", ";", "'"] as [string, string, string, string]);
  }

  return [activePreset.defaultKeys[0], activePreset.defaultKeys[1], "S", "K"] as [string, string, string, string];
}

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

function trackEvent(event: string, payload: AnalyticsPayload = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ...payload });
}

export default function MeasurePage() {
  return (
    <Suspense fallback={<main className="page-main measure-page" />}>
      <MeasurePageContent />
    </Suspense>
  );
}

function MeasurePageContent() {
  const searchParams = useSearchParams();
  const pattern = getPatternDefinition(searchParams.get("pattern")).key;
  const mode = PATTERN_MODES[pattern];

  const [selectedVariant, setSelectedVariant] = useState<MeasureVariant>(pattern === "druruk" ? "1234" : "both");
  const [keys, setKeys] = useState<[string, string, string, string]>(["A", "L", "S", "K"]);
  const [keyCaptureTarget, setKeyCaptureTarget] = useState<KeyCaptureTarget>(null);
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [countdownLeft, setCountdownLeft] = useState(COUNTDOWN_SECONDS);
  const [timeLeft, setTimeLeft] = useState(TEST_SECONDS);
  const [latestInput, setLatestInput] = useState<string>("-");
  const [validHits, setValidHits] = useState(0);
  const [invalidHits, setInvalidHits] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [peakStreak, setPeakStreak] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [activePadIndex, setActivePadIndex] = useState<number | null>(null);
  const [hitFeedback, setHitFeedback] = useState<"good" | "miss" | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);

  const deadlineRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const validHitsRef = useRef(0);
  const invalidHitsRef = useRef(0);
  const peakStreakRef = useRef(0);
  const acceptedTimestampsRef = useRef<number[]>([]);
  const activePadTimeoutRef = useRef<number | null>(null);
  const hitFeedbackTimeoutRef = useRef<number | null>(null);
  const expectedIndexRef = useRef(0);
  const acceptedStepIndicesRef = useRef<number[]>([]);
  const currentRunTimestampsRef = useRef<number[]>([]);
  const completedRunsRef = useRef<Array<{ durationMs: number; intervals: [number, number, number] }>>([]);

  const measureVariant = useMemo<MeasureVariant>(() => {
    if (pattern === "druruk") {
      return selectedVariant === "4321" ? "4321" : "1234";
    }
    if (selectedVariant === "left" || selectedVariant === "right") return selectedVariant;
    return "both";
  }, [pattern, selectedVariant]);

  const activePreset = getPresetConfig(measureVariant, pattern);
  const configuredKeys = useMemo(() => keys.map((value) => normalizeKey(value)), [keys]);
  const activeKeys = pattern === "trill" ? configuredKeys.slice(0, 2) : configuredKeys;
  const expectedSequence = useMemo(() => mode.sequence(activeKeys, measureVariant), [activeKeys, measureVariant, mode]);
  const expectedPadIndex = useMemo(() => {
    const nextKey = expectedSequence[sequenceIndex] ?? expectedSequence[0];
    return activeKeys.findIndex((key) => key === nextKey);
  }, [activeKeys, expectedSequence, sequenceIndex]);
  const hasValidKeyConfig = useMemo(() => {
    const unique = new Set(activeKeys.filter(Boolean));
    return activeKeys.length === mode.keyLabels.length && unique.size === activeKeys.length;
  }, [activeKeys, mode.keyLabels.length]);

  const helperText = useMemo(() => {
    if (keyCaptureTarget) return `${mode.keyLabels[CAPTURE_TARGETS.indexOf(keyCaptureTarget)]}를 기다리는 중이에요. 아무 키나 눌러주세요.`;
    if (captureError) return captureError;
    if (!hasValidKeyConfig) return "중복 없이 서로 다른 키를 설정해야 측정을 시작할 수 있어요.";
    if (sessionState === "countdown") return `준비... ${countdownLeft}초 후 시작`;
    if (sessionState === "running") return `현재 순서: ${expectedSequence[sequenceIndex] ?? expectedSequence[0]}`;
    if (result) {
      if (pattern === "druruk") return "선택한 모드 순서를 유지할수록 더 높은 점수가 나와요.";
      if (pattern === "yeonta") return "각 키를 4번씩 끊지 않고 정확하게 이어갈수록 더 높은 점수가 나와요.";
      return "같은 키 반복은 invalid 처리돼요. 정확도를 유지하면서 BPM을 끌어올려보세요.";
    }
    return `${mode.title} · ${activeKeys.join(" / ")}`;
  }, [captureError, countdownLeft, expectedSequence, hasValidKeyConfig, keyCaptureTarget, mode, pattern, result, sequenceIndex, sessionState, activeKeys]);

  const triggerPadFeedback = useCallback((index: number) => {
    if (activePadTimeoutRef.current) window.clearTimeout(activePadTimeoutRef.current);
    setActivePadIndex(index);
    activePadTimeoutRef.current = window.setTimeout(() => {
      setActivePadIndex(null);
      activePadTimeoutRef.current = null;
    }, 120);
  }, [setActivePadIndex]);

  const triggerHitFeedback = useCallback((type: "good" | "miss") => {
    if (hitFeedbackTimeoutRef.current) window.clearTimeout(hitFeedbackTimeoutRef.current);
    setHitFeedback(type);
    hitFeedbackTimeoutRef.current = window.setTimeout(() => {
      setHitFeedback(null);
      hitFeedbackTimeoutRef.current = null;
    }, 180);
  }, [setHitFeedback]);

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
    const consistencyScore = calculateConsistencyScore(intervals);
    const completedRuns = completedRunsRef.current;
    const runDurations = completedRuns.map((run) => run.durationMs);
    const stepIntervals = completedRuns.flatMap((run) => run.intervals);
    const drurukStats = pattern === "druruk"
      ? {
          completedRuns: completedRuns.length,
          averageRunDurationMs: calculateAverage(runDurations),
          runDurationStdDevMs: calculateStandardDeviation(runDurations),
          averageStepIntervalMs: calculateAverage(stepIntervals),
          stepIntervalStdDevMs: calculateStandardDeviation(stepIntervals),
          runDurations,
          stepIntervals,
        }
      : undefined;
    const yeontaTransitionIntervals = pattern === "yeonta"
      ? intervals.filter((_, index) => {
          const previousStep = acceptedStepIndicesRef.current[index];
          const currentStep = acceptedStepIndicesRef.current[index + 1];
          if (previousStep === undefined || currentStep === undefined) return false;
          return expectedSequence[previousStep] !== expectedSequence[currentStep];
        })
      : [];
    const yeontaStats = pattern === "yeonta"
      ? {
          transitionIntervals: yeontaTransitionIntervals,
          averageTransitionIntervalMs: calculateAverage(yeontaTransitionIntervals),
          transitionIntervalStdDevMs: calculateStandardDeviation(yeontaTransitionIntervals),
        }
      : undefined;

    trackEvent("measure_finish", {
      pattern,
      variant: measureVariant,
      bpm,
      accuracy: Math.round(accuracy),
      valid_hits: validHitsRef.current,
      invalid_hits: invalidHitsRef.current,
      peak_streak: peakStreakRef.current,
      consistency_score: consistencyScore,
      completed_runs: drurukStats?.completedRuns,
      run_avg_ms: drurukStats?.averageRunDurationMs ? Math.round(drurukStats.averageRunDurationMs) : undefined,
      run_stddev_ms: drurukStats?.runDurationStdDevMs ? Math.round(drurukStats.runDurationStdDevMs) : undefined,
      step_avg_ms: drurukStats?.averageStepIntervalMs ? Math.round(drurukStats.averageStepIntervalMs) : undefined,
      step_stddev_ms: drurukStats?.stepIntervalStdDevMs ? Math.round(drurukStats.stepIntervalStdDevMs) : undefined,
      yeonta_transition_avg_ms: yeontaStats?.averageTransitionIntervalMs ? Math.round(yeontaStats.averageTransitionIntervalMs) : undefined,
      yeonta_transition_stddev_ms: yeontaStats?.transitionIntervalStdDevMs ? Math.round(yeontaStats.transitionIntervalStdDevMs) : undefined,
    });

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
      druruk: drurukStats,
      yeonta: yeontaStats,
    });
  }, [expectedSequence, measureVariant, pattern, setResult, setSessionState]);

  const resetStats = useCallback(() => {
    setCountdownLeft(COUNTDOWN_SECONDS);
    setTimeLeft(TEST_SECONDS);
    setLatestInput("-");
    setValidHits(0);
    setInvalidHits(0);
    setCurrentStreak(0);
    setPeakStreak(0);
    setResult(null);
    setCaptureError(null);
    setActivePadIndex(null);
    setHitFeedback(null);
    setSequenceIndex(0);
    expectedIndexRef.current = 0;
    deadlineRef.current = null;
    runningRef.current = false;
    validHitsRef.current = 0;
    invalidHitsRef.current = 0;
    peakStreakRef.current = 0;
    acceptedTimestampsRef.current = [];
    acceptedStepIndicesRef.current = [];
    currentRunTimestampsRef.current = [];
    completedRunsRef.current = [];
  }, [
    setCountdownLeft,
    setTimeLeft,
    setLatestInput,
    setValidHits,
    setInvalidHits,
    setCurrentStreak,
    setPeakStreak,
    setResult,
    setCaptureError,
    setActivePadIndex,
    setHitFeedback,
    setSequenceIndex,
  ]);

  useEffect(() => {
    const nextKeys = getDefaultKeys(pattern, measureVariant, activePreset);

    const timer = window.setTimeout(() => {
      setKeys(nextKeys);
      setKeyCaptureTarget(null);
      setSessionState("idle");
      resetStats();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [activePreset, measureVariant, pattern, resetStats]);

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

  useEffect(() => () => {
    if (activePadTimeoutRef.current) window.clearTimeout(activePadTimeoutRef.current);
    if (hitFeedbackTimeoutRef.current) window.clearTimeout(hitFeedbackTimeoutRef.current);
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
        pattern,
        variant: measureVariant,
        keys: activeKeys,
        result,
      }),
    );
  }, [activeKeys, measureVariant, pattern, result, sessionState]);

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
        setKeys((current) => {
          const next = [...current] as [string, string, string, string];
          next[CAPTURE_TARGETS.indexOf(keyCaptureTarget)] = pressedKey;
          return next;
        });
        setKeyCaptureTarget(null);
        setSessionState("idle");
        resetStats();
        return;
      }

      const pressedKey = normalizeKeyboardEvent(event);
      if (!pressedKey) return;
      if (!runningRef.current || !hasValidKeyConfig || !activeKeys.includes(pressedKey)) return;

      event.preventDefault();
      setLatestInput(pressedKey);
      const expectedKey = expectedSequence[expectedIndexRef.current % expectedSequence.length];
      const padIndex = activeKeys.findIndex((key) => key === pressedKey);

      if (pressedKey === expectedKey) {
        triggerPadFeedback(Math.max(padIndex, 0));
        triggerHitFeedback("good");
        const timestamp = performance.now();
        const expectedStepIndex = expectedIndexRef.current % expectedSequence.length;
        acceptedTimestampsRef.current = [...acceptedTimestampsRef.current, timestamp];
        acceptedStepIndicesRef.current = [...acceptedStepIndicesRef.current, expectedStepIndex];

        if (pattern === "druruk") {
          const runTimestamps = [...currentRunTimestampsRef.current, timestamp];
          currentRunTimestampsRef.current = runTimestamps;
          if (runTimestamps.length === expectedSequence.length) {
            completedRunsRef.current = [
              ...completedRunsRef.current,
              {
                durationMs: runTimestamps[runTimestamps.length - 1] - runTimestamps[0],
                intervals: [
                  runTimestamps[1] - runTimestamps[0],
                  runTimestamps[2] - runTimestamps[1],
                  runTimestamps[3] - runTimestamps[2],
                ],
              },
            ];
            currentRunTimestampsRef.current = [];
          }
        }

        expectedIndexRef.current = (expectedIndexRef.current + 1) % expectedSequence.length;
        setSequenceIndex(expectedIndexRef.current);
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
      if (pattern === "druruk") {
        expectedIndexRef.current = 0;
        currentRunTimestampsRef.current = [];
        setSequenceIndex(0);
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
  }, [activeKeys, expectedSequence, hasValidKeyConfig, keyCaptureTarget, pattern, resetStats, triggerHitFeedback, triggerPadFeedback]);

  function startRun() {
    if (!hasValidKeyConfig || keyCaptureTarget !== null) return;
    trackEvent("measure_start", {
      pattern,
      variant: measureVariant,
      keys: activeKeys.join("_"),
    });
    resetStats();
    setSessionState("countdown");
  }

  function applyPreset(variant: MeasureVariant) {
    const preset = getPresetConfig(variant, pattern);
    setSelectedVariant(variant);
    setKeys(getDefaultKeys(pattern, variant, preset));
    setKeyCaptureTarget(null);
    setSessionState("idle");
    resetStats();
  }

  function beginKeyCapture(target: Exclude<KeyCaptureTarget, null>) {
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
        <h1 className="page-title">{mode.title}</h1>
        <div className="status-pill">{statusLabel}</div>
      </section>

      <section className="page-section compact-summary panel">
        <strong>{getPatternDefinition(pattern).label}</strong>
        <span className="compact-summary-divider">·</span>
        <span>{activeKeys.join(" / ")}</span>
        <span className="compact-summary-divider">·</span>
        <span>{helperText}</span>
      </section>

      <section className="measure-grid">
        <article className="panel stack-gap-lg start-panel">
          <div>
            {pattern === "yeonta" ? (
              <>
                <p className="section-label">패턴 안내</p>
                <p className="section-subtitle">{mode.description}</p>
                <div className="sequence-preview">
                  {expectedSequence.map((key, index) => (
                    <span key={`${key}-${index}`} className="sequence-chip">{key}</span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="section-label">모드 선택</p>
                <div className="preset-grid">
                  {(pattern === "trill" ? MEASURE_PRESETS : DRURUK_PRESETS).map((preset) => {
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
                {pattern === "druruk" ? (
                  <>
                    <p className="section-subtitle">{mode.description}</p>
                    <div className="sequence-preview">
                      {expectedSequence.map((key, index) => (
                        <span key={`${key}-${index}`} className="sequence-chip">{key}</span>
                      ))}
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>

          <div>
            <p className="section-label">키 설정</p>
            <div className="key-grid">
              {activeKeys.map((value, index) => (
                <KeySettingCard
                  key={`${mode.key}-${index}`}
                  label={mode.keyLabels[index]}
                  value={value}
                  hint={mode.keyHints[index]}
                  isCapturing={keyCaptureTarget === CAPTURE_TARGETS[index]}
                  onStartCapture={() => beginKeyCapture(CAPTURE_TARGETS[index])}
                  disabled={sessionState === "countdown" || sessionState === "running"}
                />
              ))}
            </div>
            <p className={`inline-note ${captureError || !hasValidKeyConfig ? "is-danger" : ""}`}>
              {captureError ?? (hasValidKeyConfig ? `현재 ${activeKeys.join(" / ")} 조합으로 측정해요.` : "중복 없이 서로 다른 키를 설정해야 측정을 시작할 수 있어요.")}
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
              <div className={`pad-grid compact-pad-grid ${pattern === "druruk" ? "is-four" : ""}`}>
                {activeKeys.map((value, index) => (
                  <RhythmPad
                    key={`${value}-${index}`}
                    label={mode.keyLabels[index]}
                    value={value}
                    isActive={activePadIndex === index}
                    isExpected={expectedPadIndex === index && sessionState !== "countdown"}
                    compact
                  />
                ))}
              </div>
              {pattern === "druruk" ? (
                <p className="section-subtitle">다음 입력: <strong>{expectedSequence[sequenceIndex] ?? expectedSequence[0]}</strong></p>
              ) : null}
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
            <h2 className="result-title">
              {result
                ? pattern === "druruk"
                  ? `${result.druruk?.completedRuns ?? 0} RUNS`
                  : `${result.bpm} BPM`
                : "-"}
            </h2>
            <p className="section-subtitle">
              {result
                ? pattern === "druruk"
                  ? `평균 드르륵 ${formatMs(result.druruk?.averageRunDurationMs ?? null)} · 단계 간격 표준편차 ${formatMs(result.druruk?.stepIntervalStdDevMs ?? null)} · 참고 BPM ${result.bpm}`
                  : pattern === "yeonta"
                    ? `전환 딜레이 ${formatMs(result.yeonta?.averageTransitionIntervalMs ?? null)} · 정확도 ${formatPercent(result.accuracy)} · 최대 스트릭 ${result.peakStreak}`
                    : `정확도 ${formatPercent(result.accuracy)} · 유효 ${result.validHits} · 무효 ${result.invalidHits} · 최대 스트릭 ${result.peakStreak}`
                : "측정 전"}
            </p>
          </div>

          <div className="interval-stats-grid">
            {pattern === "druruk" ? (
              <>
                <Stat label="완성 드르륵" value={result ? String(result.druruk?.completedRuns ?? 0) : "-"} />
                <Stat label="평균 드르륵" value={result ? formatMs(result.druruk?.averageRunDurationMs ?? null) : "-"} />
                <Stat label="드르륵 표준편차" value={result ? formatMs(result.druruk?.runDurationStdDevMs ?? null) : "-"} />
                <Stat label="평균 단계 간격" value={result ? formatMs(result.druruk?.averageStepIntervalMs ?? null) : "-"} />
                <Stat label="단계 간격 표준편차" value={result ? formatMs(result.druruk?.stepIntervalStdDevMs ?? null) : "-"} />
                <Stat label="참고 BPM" value={result ? String(result.bpm) : "-"} />
                <Stat label="정확도" value={result ? formatPercent(result.accuracy) : "-"} />
                <Stat label="일정함" value={result ? `${result.consistencyScore}%` : "-"} />
              </>
            ) : pattern === "yeonta" ? (
              <>
                <Stat label="평균 간격" value={result ? formatMs(result.averageIntervalMs) : "-"} />
                <Stat label="전환 딜레이" value={result ? formatMs(result.yeonta?.averageTransitionIntervalMs ?? null) : "-"} />
                <Stat label="전환 편차" value={result ? formatMs(result.yeonta?.transitionIntervalStdDevMs ?? null) : "-"} />
                <Stat label="최고 속도" value={result ? formatMs(result.fastestIntervalMs) : "-"} />
                <Stat label="최저 속도" value={result ? formatMs(result.slowestIntervalMs) : "-"} />
                <Stat label="일정함" value={result ? `${result.consistencyScore}%` : "-"} />
              </>
            ) : (
              <>
                <Stat label="평균 간격" value={result ? formatMs(result.averageIntervalMs) : "-"} />
                <Stat label="최고 속도" value={result ? formatMs(result.fastestIntervalMs) : "-"} />
                <Stat label="최저 속도" value={result ? formatMs(result.slowestIntervalMs) : "-"} />
                <Stat label="일정함" value={result ? `${result.consistencyScore}%` : "-"} />
              </>
            )}
          </div>

          <div className="interval-chart-wrap">
            <p className="section-label">간격 그래프</p>
            {result && result.intervals.length > 1 ? (
              <>
                <IntervalChart intervals={result.intervals} />
                <p className="section-subtitle">선이 평평할수록 더 일정한 패턴이에요.</p>
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
  isExpected = false,
  compact = false,
}: {
  label: string;
  value: string;
  isActive: boolean;
  isExpected?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`rhythm-pad ${compact ? "is-compact" : ""} ${isExpected ? "is-expected" : ""} ${isActive ? "is-active" : ""}`}>
      <span className="rhythm-pad-label">{label}</span>
      <strong className="rhythm-pad-value">{value}</strong>
      {isExpected ? <span className="rhythm-pad-target">NOW</span> : null}
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
