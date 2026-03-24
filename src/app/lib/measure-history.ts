export type MeasureVariant = "left" | "right" | "both";

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
};

export type MeasureHistoryEntry = {
  id: string;
  createdAt: string;
  variant: MeasureVariant;
  primaryKey: string;
  secondaryKey: string;
  result: MeasureResult;
};

export const MEASURE_HISTORY_STORAGE_KEY = "trill-lab.measure-history.v1";

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
  variant: MeasureVariant;
  primaryKey: string;
  secondaryKey: string;
  result: MeasureResult;
}): MeasureHistoryEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    variant: params.variant,
    primaryKey: params.primaryKey,
    secondaryKey: params.secondaryKey,
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

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getVariantLabel(variant: MeasureVariant) {
  if (variant === "left") return "왼손 모드";
  if (variant === "right") return "오른손 모드";
  return "양손 모드";
}
