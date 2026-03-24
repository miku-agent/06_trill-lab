import type { PatternKey } from "./patterns";

export type MeasureVariant = "left" | "right" | "both" | "1234" | "4321";

export type DrurukStats = {
  completedRuns: number;
  averageRunDurationMs: number | null;
  runDurationStdDevMs: number | null;
  averageStepIntervalMs: number | null;
  stepIntervalStdDevMs: number | null;
  runDurations: number[];
  stepIntervals: number[];
};

export type YeontaStats = {
  transitionIntervals: number[];
  averageTransitionIntervalMs: number | null;
  transitionIntervalStdDevMs: number | null;
};

export type MeasureResult = {
  bpm: number;
  validHits: number;
  invalidHits: number;
  accuracy: number;
  peakStreak: number;
  averageIntervalMs: number | null;
  fastestIntervalMs: number | null;
  slowestIntervalMs: number | null;
  consistencyScore: number;
  intervals: number[];
  druruk?: DrurukStats;
  yeonta?: YeontaStats;
};

export type MeasureHistoryEntry = {
  id: string;
  createdAt: string;
  pattern: PatternKey;
  variant: MeasureVariant;
  primaryKey: string;
  secondaryKey: string;
  keys: string[];
  result: MeasureResult;
};

export const MEASURE_HISTORY_STORAGE_KEY = "trill-lab.measure-history.v2";

export function readMeasureHistory(): MeasureHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(MEASURE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MeasureHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeMeasureHistory(entries: MeasureHistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MEASURE_HISTORY_STORAGE_KEY, JSON.stringify(entries));
}

export function appendMeasureHistory(entry: MeasureHistoryEntry) {
  const current = readMeasureHistory();
  const next = [entry, ...current].slice(0, 100);
  writeMeasureHistory(next);
}

export function createMeasureHistoryEntry(params: {
  pattern: PatternKey;
  variant: MeasureVariant;
  keys: string[];
  result: MeasureResult;
}): MeasureHistoryEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    pattern: params.pattern,
    variant: params.variant,
    primaryKey: params.keys[0] ?? "-",
    secondaryKey: params.keys[1] ?? "-",
    keys: params.keys,
    result: params.result,
  };
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatMs(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value)} ms`;
}

export function formatDecimal(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}`;
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getVariantLabel(variant: MeasureVariant, pattern?: PatternKey) {
  if (pattern === "druruk") {
    if (variant === "4321" || variant === "right") return "4321 모드";
    if (variant === "both") return "드르륵 전체";
    return "1234 모드";
  }
  if (pattern === "yeonta") return "연타 모드";
  if (variant === "left") return "왼손 모드";
  if (variant === "right") return "오른손 모드";
  return "양손 모드";
}

export function getPatternLabel(pattern: PatternKey) {
  if (pattern === "trill") return "트릴";
  if (pattern === "druruk") return "드르륵";
  return "연타";
}
