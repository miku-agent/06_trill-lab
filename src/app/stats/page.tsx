"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  formatDateTime,
  formatMs,
  formatPercent,
  getPatternLabel,
  getVariantLabel,
  readMeasureHistory,
  type MeasureHistoryEntry,
  type MeasureVariant,
} from "../lib/measure-history";
import { getPatternDefinition, type PatternKey } from "../lib/patterns";

type StatsSummary = {
  totalRuns: number;
  bestBpm: number;
  averageBpm: number;
  bestConsistency: number;
  averageAccuracy: number;
  completedDrurukRuns: number;
  averageDrurukDurationMs: number | null;
  drurukDurationStdDevMs: number | null;
  averageDrurukStepIntervalMs: number | null;
  drurukStepIntervalStdDevMs: number | null;
};

const FILTER_LINKS: Array<{ label: string; href: string }> = [
  { label: "전체", href: "/stats" },
  { label: "트릴", href: "/stats?pattern=trill" },
  { label: "연타", href: "/stats?pattern=yeonta" },
  { label: "드르륵 1234", href: "/stats?pattern=druruk&variant=left" },
  { label: "드르륵 4321", href: "/stats?pattern=druruk&variant=right" },
];

export default function StatsPage() {
  return (
    <Suspense fallback={<main className="page-main"><section className="page-section"><article className="panel simple-panel"><p className="section-label">STATS</p><h1 className="section-title">통계를 불러오는 중이에요</h1></article></section></main>}>
      <StatsPageContent />
    </Suspense>
  );
}

function StatsPageContent() {
  const searchParams = useSearchParams();
  const [history, setHistory] = useState<MeasureHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string>("");

  const patternParam = searchParams.get("pattern");
  const variantParam = searchParams.get("variant");
  const activePattern = patternParam ? getPatternDefinition(patternParam).key : null;
  const activeVariant = isMeasureVariant(variantParam) ? variantParam : null;

  useEffect(() => {
    const sync = () => {
      const next = readMeasureHistory();
      setHistory(next);
    };

    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const filteredHistory = useMemo(() => {
    return history.filter((entry) => {
      if (activePattern && entry.pattern !== activePattern) return false;
      if (activeVariant && entry.variant !== activeVariant) return false;
      return true;
    });
  }, [activePattern, activeVariant, history]);

  const resolvedSelectedId = useMemo(() => {
    if (!filteredHistory.length) return null;
    if (selectedId && filteredHistory.some((entry) => entry.id === selectedId)) return selectedId;
    return filteredHistory[0]?.id ?? null;
  }, [filteredHistory, selectedId]);

  const selectedRun = useMemo(
    () => filteredHistory.find((entry) => entry.id === resolvedSelectedId) ?? filteredHistory[0] ?? null,
    [filteredHistory, resolvedSelectedId],
  );

  const summary = useMemo<StatsSummary>(() => {
    if (filteredHistory.length === 0) {
      return {
        totalRuns: 0,
        bestBpm: 0,
        averageBpm: 0,
        bestConsistency: 0,
        averageAccuracy: 0,
        completedDrurukRuns: 0,
        averageDrurukDurationMs: null,
        drurukDurationStdDevMs: null,
        averageDrurukStepIntervalMs: null,
        drurukStepIntervalStdDevMs: null,
      };
    }

    const totalRuns = filteredHistory.length;
    const bestBpm = Math.max(...filteredHistory.map((entry) => entry.result.bpm));
    const averageBpm = Math.round(filteredHistory.reduce((sum, entry) => sum + entry.result.bpm, 0) / totalRuns);
    const bestConsistency = Math.max(...filteredHistory.map((entry) => entry.result.consistencyScore));
    const averageAccuracy = Math.round(filteredHistory.reduce((sum, entry) => sum + entry.result.accuracy, 0) / totalRuns);

    const drurukEntries = filteredHistory.filter((entry) => entry.pattern === "druruk" && entry.result.druruk);
    const runDurations = drurukEntries.flatMap((entry) => entry.result.druruk?.runDurations ?? []);
    const stepIntervals = drurukEntries.flatMap((entry) => entry.result.druruk?.stepIntervals ?? []);
    const completedDrurukRuns = drurukEntries.reduce((sum, entry) => sum + (entry.result.druruk?.completedRuns ?? 0), 0);

    return {
      totalRuns,
      bestBpm,
      averageBpm,
      bestConsistency,
      averageAccuracy,
      completedDrurukRuns,
      averageDrurukDurationMs: average(runDurations),
      drurukDurationStdDevMs: standardDeviation(runDurations),
      averageDrurukStepIntervalMs: average(stepIntervals),
      drurukStepIntervalStdDevMs: standardDeviation(stepIntervals),
    };
  }, [filteredHistory]);

  const recentTopRuns = useMemo(() => filteredHistory.slice(0, 3), [filteredHistory]);
  const filterTitle = getFilterTitle(activePattern, activeVariant);
  const representativeIntervals = selectedRun?.pattern === "druruk"
    ? selectedRun.result.druruk?.stepIntervals ?? []
    : selectedRun?.result.intervals ?? [];

  async function downloadRunShareCard(entry: MeasureHistoryEntry) {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const context = canvas.getContext("2d");
    if (!context) return;

    const { width, height } = canvas;
    paintBackground(context, width, height);

    context.fillStyle = "#64f5e7";
    context.font = "700 34px Arial";
    context.fillText("TRILL LAB", 110, 140);

    context.fillStyle = "#ecfeff";
    context.font = "800 108px Arial";
    context.fillText(getShareHeadline(entry), 110, 300);

    context.fillStyle = "#9fb4bb";
    context.font = "600 40px Arial";
    context.fillText(`${getPatternLabel(entry.pattern)} · ${getVariantLabel(entry.variant, entry.pattern)} · ${entry.keys.join(" / ")}`, 112, 362);

    const metrics = getRunMetricCards(entry);
    metrics.forEach((metric, index) => {
      const x = 110 + (index % 3) * 335;
      const y = 450 + Math.floor(index / 3) * 214;
      drawMetric(context, { x, y, w: 300, h: 180, label: metric.label, value: metric.value });
    });

    context.fillStyle = "rgba(236, 254, 255, 0.96)";
    context.font = "700 38px Arial";
    context.fillText(entry.pattern === "druruk" ? "드르륵 간격 프로필" : "간격 프로필", 110, 1110);

    drawIntervals(context, representativeIntervalsForEntry(entry), 110, 1148, 970, 220);

    context.fillStyle = "#9fb4bb";
    context.font = "600 32px Arial";
    context.fillText(`저장 시각 ${formatDateTime(entry.createdAt)}`, 110, 1428);
    context.fillText(getShareCaption(entry), 110, 1470);

    downloadCanvas(canvas, getRunShareFilename(entry));
    setShareStatus("선택한 기록 공유 이미지가 다운로드되었어요.");
  }

  async function downloadOverallShareCard() {
    if (filteredHistory.length === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 1600;
    const context = canvas.getContext("2d");
    if (!context) return;

    const { width, height } = canvas;
    paintBackground(context, width, height);

    context.fillStyle = "#64f5e7";
    context.font = "700 34px Arial";
    context.fillText("TRILL LAB", 100, 130);

    context.fillStyle = "#ecfeff";
    context.font = "800 86px Arial";
    context.fillText(filterTitle, 100, 250);

    context.fillStyle = "#9fb4bb";
    context.font = "600 34px Arial";
    context.fillText(`${summary.totalRuns}회 측정 · 평균 정확도 ${summary.averageAccuracy}%`, 102, 304);

    const summaryCards = getSummaryMetricCards(summary, activePattern);
    summaryCards.forEach((metric, index) => {
      const x = 100 + (index % 4) * 300;
      const y = 390 + Math.floor(index / 4) * 210;
      const widthForCard = index % 4 === 3 ? 330 : 270;
      drawMetric(context, { x, y, w: widthForCard, h: 170, label: metric.label, value: metric.value });
    });

    context.fillStyle = "rgba(236, 254, 255, 0.96)";
    context.font = "700 40px Arial";
    context.fillText("최근 기록", 100, 890);

    recentTopRuns.forEach((entry, index) => {
      const y = 940 + index * 170;
      drawSummaryRow(context, {
        x: 100,
        y,
        width: 1200,
        title: getShareHeadline(entry),
        subtitle: `${getPatternLabel(entry.pattern)} · ${getVariantLabel(entry.variant, entry.pattern)} · ${entry.keys.join(" / ")}`,
        metaLeft: getShareMeta(entry),
        metaRight: formatDateTime(entry.createdAt),
      });
    });

    context.fillStyle = "rgba(236, 254, 255, 0.96)";
    context.font = "700 38px Arial";
    context.fillText(activePattern === "druruk" ? "대표 단계 간격 프로필" : "대표 간격 프로필", 100, 1450);

    drawIntervals(context, representativeIntervals, 100, 1485, 1200, 90);

    downloadCanvas(canvas, getOverallShareFilename(activePattern, activeVariant));
    setShareStatus("현재 필터 기준 통계 이미지가 다운로드되었어요.");
  }

  return (
    <main className="page-main">
      <section className="page-section compact-hero">
        <div>
          <p className="eyebrow">STATS</p>
          <h1 className="page-title">{filterTitle}</h1>
        </div>
        <div className="status-pill">{filteredHistory.length}회 측정</div>
      </section>

      <section className="page-section compact-summary panel">
        <strong>쿼리 필터 지원</strong>
        <span className="compact-summary-divider">·</span>
        <span>예: `/stats?pattern=druruk&variant=left`, `/stats?pattern=druruk&variant=right`</span>
      </section>

      <section className="page-section pattern-select-grid" aria-label="통계 필터 선택">
        {FILTER_LINKS.map((filter) => {
          const isActive = filter.href === buildActiveFilterHref(activePattern, activeVariant);
          return (
            <Link key={filter.href} href={filter.href} className={`pattern-select-card panel ${isActive ? "is-active" : ""}`}>
              <strong>{filter.label}</strong>
              <p>{filter.href.replace("/stats", "/stats")}</p>
              <span>필터 적용</span>
            </Link>
          );
        })}
      </section>

      {filteredHistory.length === 0 ? (
        <section className="page-section">
          <article className="panel simple-panel">
            <p className="section-label">아직 데이터가 없어요</p>
            <h2 className="section-title">이 필터에는 기록이 없어요</h2>
            <p className="section-subtitle">다른 패턴/모드로 바꾸거나 측정을 한 번 더 완료해보세요.</p>
          </article>
        </section>
      ) : (
        <>
          <section className="stats-overview-grid page-section">
            {getOverviewCards(summary, activePattern).map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} />
            ))}
          </section>

          <section className="stats-layout page-section">
            <article className="panel stack-gap-lg">
              <div>
                <p className="section-label">최근 기록</p>
                <h2 className="section-title">확인할 기록을 선택하세요</h2>
              </div>
              <div className="history-list">
                {filteredHistory.map((entry) => {
                  const isActive = selectedRun?.id === entry.id;
                  return (
                    <button key={entry.id} type="button" className={`history-card ${isActive ? "is-active" : ""}`} onClick={() => setSelectedId(entry.id)}>
                      <div>
                        <strong>{getShareHeadline(entry)}</strong>
                        <span>{getPatternLabel(entry.pattern)} · {getVariantLabel(entry.variant, entry.pattern)} · {entry.keys.join(" / ")}</span>
                      </div>
                      <div className="history-meta">
                        <span>{getShareMeta(entry)}</span>
                        <span>{formatDateTime(entry.createdAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>

            {selectedRun ? (
              <article className="panel stack-gap-lg">
                <div className="share-card-preview">
                  <div className="share-card-preview-header">
                    <span className="brand-mark">TRILL LAB</span>
                    <span>{formatDateTime(selectedRun.createdAt)}</span>
                  </div>
                  <div>
                    <p className="section-label">선택한 기록</p>
                    <h2 className="share-bpm">{getShareHeadline(selectedRun)}</h2>
                    <p className="section-subtitle">{getPatternLabel(selectedRun.pattern)} · {getVariantLabel(selectedRun.variant, selectedRun.pattern)} · {selectedRun.keys.join(" / ")}</p>
                  </div>
                  <div className="share-card-metrics">
                    {getRunMetricCards(selectedRun).slice(0, 4).map((metric) => (
                      <StatCard key={metric.label} label={metric.label} value={metric.value} compact />
                    ))}
                  </div>
                </div>

                <div className="interval-stats-grid">
                  {getRunMetricCards(selectedRun).slice(4).map((metric) => (
                    <StatCard key={metric.label} label={metric.label} value={metric.value} compact />
                  ))}
                </div>

                <div className="share-card-preview">
                  <div className="share-card-preview-header">
                    <span className="brand-mark">TRILL LAB</span>
                    <span>현재 필터 통계 공유</span>
                  </div>
                  <div>
                    <p className="section-label">필터 기반 요약</p>
                    <h2 className="section-title">쿼리스트링으로 분리된 통계 이미지</h2>
                    <p className="section-subtitle">현재 페이지 필터 그대로 이미지가 만들어져요. 드르륵은 1234/4321 각각 따로 뽑을 수 있어요.</p>
                  </div>
                  <div className="share-card-metrics">
                    {getOverviewCards(summary, activePattern).slice(0, 4).map((card) => (
                      <StatCard key={card.label} label={card.label} value={card.value} compact />
                    ))}
                  </div>
                </div>

                <div className="share-actions">
                  <button type="button" className="primary-button" onClick={() => downloadRunShareCard(selectedRun)}>
                    선택한 기록 이미지 다운로드
                  </button>
                  <button type="button" className="secondary-button" onClick={downloadOverallShareCard}>
                    현재 필터 통계 이미지 다운로드
                  </button>
                  {shareStatus ? <span className="hint-text">{shareStatus}</span> : null}
                </div>
              </article>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function StatCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`stat-card ${compact ? "stat-card-compact" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function isMeasureVariant(value: string | null): value is MeasureVariant {
  return value === "left" || value === "right" || value === "both";
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const avg = average(values);
  if (avg === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function getFilterTitle(pattern: PatternKey | null, variant: MeasureVariant | null) {
  if (pattern === "druruk" && variant) return `드르륵 ${getVariantLabel(variant, pattern)} 통계`;
  if (pattern) return `${getPatternDefinition(pattern).label} 통계`;
  return "내 전체 기록";
}

function buildActiveFilterHref(pattern: PatternKey | null, variant: MeasureVariant | null) {
  const params = new URLSearchParams();
  if (pattern) params.set("pattern", pattern);
  if (variant) params.set("variant", variant);
  const query = params.toString();
  return query ? `/stats?${query}` : "/stats";
}

function representativeIntervalsForEntry(entry: MeasureHistoryEntry) {
  if (entry.pattern === "druruk") return entry.result.druruk?.stepIntervals ?? [];
  return entry.result.intervals;
}

function getShareHeadline(entry: MeasureHistoryEntry) {
  if (entry.pattern === "druruk") return `${entry.result.druruk?.completedRuns ?? 0} RUNS`;
  return `${entry.result.bpm} BPM`;
}

function getShareMeta(entry: MeasureHistoryEntry) {
  if (entry.pattern === "druruk") {
    return `평균 드르륵 ${formatMs(entry.result.druruk?.averageRunDurationMs ?? null)} · 단계 편차 ${formatMs(entry.result.druruk?.stepIntervalStdDevMs ?? null)}`;
  }
  return `정확도 ${formatPercent(entry.result.accuracy)} · 일정함 ${entry.result.consistencyScore}%`;
}

function getRunMetricCards(entry: MeasureHistoryEntry) {
  if (entry.pattern === "druruk") {
    return [
      { label: "완성 드르륵", value: String(entry.result.druruk?.completedRuns ?? 0) },
      { label: "평균 드르륵", value: formatMs(entry.result.druruk?.averageRunDurationMs ?? null) },
      { label: "드르륵 표준편차", value: formatMs(entry.result.druruk?.runDurationStdDevMs ?? null) },
      { label: "평균 단계 간격", value: formatMs(entry.result.druruk?.averageStepIntervalMs ?? null) },
      { label: "단계 간격 표준편차", value: formatMs(entry.result.druruk?.stepIntervalStdDevMs ?? null) },
      { label: "참고 BPM", value: String(entry.result.bpm) },
      { label: "정확도", value: formatPercent(entry.result.accuracy) },
      { label: "일정함", value: `${entry.result.consistencyScore}%` },
    ];
  }

  return [
    { label: "정확도", value: formatPercent(entry.result.accuracy) },
    { label: "일정함", value: `${entry.result.consistencyScore}%` },
    { label: "최대 스트릭", value: String(entry.result.peakStreak) },
    { label: "평균 간격", value: formatMs(entry.result.averageIntervalMs) },
    { label: "최고 속도", value: formatMs(entry.result.fastestIntervalMs) },
    { label: "최저 속도", value: formatMs(entry.result.slowestIntervalMs) },
    { label: "유효 입력", value: String(entry.result.validHits) },
    { label: "무효 입력", value: String(entry.result.invalidHits) },
  ];
}

function getOverviewCards(summary: StatsSummary, activePattern: PatternKey | null) {
  if (activePattern === "druruk") {
    return [
      { label: "총 측정 수", value: String(summary.totalRuns) },
      { label: "완성 드르륵", value: String(summary.completedDrurukRuns) },
      { label: "평균 드르륵", value: formatMs(summary.averageDrurukDurationMs) },
      { label: "드르륵 표준편차", value: formatMs(summary.drurukDurationStdDevMs) },
      { label: "평균 단계 간격", value: formatMs(summary.averageDrurukStepIntervalMs) },
      { label: "단계 간격 표준편차", value: formatMs(summary.drurukStepIntervalStdDevMs) },
      { label: "평균 정확도", value: `${summary.averageAccuracy}%` },
      { label: "최고 일정함", value: `${summary.bestConsistency}%` },
    ];
  }

  return [
    { label: "총 측정 수", value: String(summary.totalRuns) },
    { label: "최고 BPM", value: String(summary.bestBpm) },
    { label: "평균 BPM", value: String(summary.averageBpm) },
    { label: "최고 일정함", value: `${summary.bestConsistency}%` },
  ];
}

function getSummaryMetricCards(summary: StatsSummary, activePattern: PatternKey | null) {
  if (activePattern === "druruk") {
    return [
      { label: "총 측정 수", value: String(summary.totalRuns) },
      { label: "완성 드르륵", value: String(summary.completedDrurukRuns) },
      { label: "평균 드르륵", value: formatMs(summary.averageDrurukDurationMs) },
      { label: "드르륵 표준편차", value: formatMs(summary.drurukDurationStdDevMs) },
      { label: "평균 단계 간격", value: formatMs(summary.averageDrurukStepIntervalMs) },
      { label: "단계 간격 편차", value: formatMs(summary.drurukStepIntervalStdDevMs) },
      { label: "평균 정확도", value: `${summary.averageAccuracy}%` },
      { label: "최고 일정함", value: `${summary.bestConsistency}%` },
    ];
  }

  return [
    { label: "총 측정 수", value: String(summary.totalRuns) },
    { label: "최고 BPM", value: String(summary.bestBpm) },
    { label: "평균 BPM", value: String(summary.averageBpm) },
    { label: "최고 일정함", value: `${summary.bestConsistency}%` },
  ];
}

function getRunShareFilename(entry: MeasureHistoryEntry) {
  const variant = entry.pattern === "druruk" ? getVariantLabel(entry.variant, entry.pattern).replaceAll(" ", "-") : entry.variant;
  return `trill-lab-${entry.pattern}-${variant}-${entry.id}.png`;
}

function getOverallShareFilename(pattern: PatternKey | null, variant: MeasureVariant | null) {
  const suffix = [pattern, variant].filter(Boolean).join("-") || "all";
  return `trill-lab-stats-${suffix}.png`;
}

function getShareCaption(entry: MeasureHistoryEntry) {
  if (entry.pattern === "druruk") return "드르륵은 run 기준 통계로 속도와 편차를 함께 확인해보세요.";
  if (entry.pattern === "yeonta") return "연타 패턴의 BPM과 안정감을 한 장으로 공유해보세요.";
  return "트릴을 측정하고, 안정성을 확인하고, 최고 기록을 공유해보세요.";
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  link.click();
}

function paintBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07131a");
  gradient.addColorStop(0.55, "#0c1f29");
  gradient.addColorStop(1, "#123240");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(100, 245, 231, 0.12)";
  context.beginPath();
  context.arc(150, 180, 180, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(width - 220, 260, 220, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(100, 245, 231, 0.18)";
  context.lineWidth = 2;
  roundRect(context, 64, 64, width - 128, height - 128, 36);
  context.stroke();
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawMetric(
  context: CanvasRenderingContext2D,
  { x, y, w, h, label, value }: { x: number; y: number; w: number; h: number; label: string; value: string },
) {
  context.fillStyle = "rgba(255, 255, 255, 0.05)";
  roundRect(context, x, y, w, h, 28);
  context.fill();
  context.strokeStyle = "rgba(100, 245, 231, 0.14)";
  context.stroke();

  context.fillStyle = "#9fb4bb";
  context.font = "700 28px Arial";
  context.fillText(label, x + 28, y + 56);

  context.fillStyle = "#ecfeff";
  context.font = "800 54px Arial";
  context.fillText(value, x + 28, y + 122);
}

function drawSummaryRow(
  context: CanvasRenderingContext2D,
  params: { x: number; y: number; width: number; title: string; subtitle: string; metaLeft: string; metaRight: string },
) {
  context.fillStyle = "rgba(255, 255, 255, 0.04)";
  roundRect(context, params.x, params.y, params.width, 132, 24);
  context.fill();
  context.strokeStyle = "rgba(100, 245, 231, 0.14)";
  context.stroke();

  context.fillStyle = "#ecfeff";
  context.font = "700 34px Arial";
  context.fillText(params.title, params.x + 28, params.y + 46);

  context.fillStyle = "#9fb4bb";
  context.font = "600 24px Arial";
  context.fillText(params.subtitle, params.x + 28, params.y + 80);
  context.fillText(params.metaLeft, params.x + 28, params.y + 112);

  const rightTextWidth = context.measureText(params.metaRight).width;
  context.fillText(params.metaRight, params.x + params.width - rightTextWidth - 28, params.y + 112);
}

function drawIntervals(
  context: CanvasRenderingContext2D,
  intervals: number[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const normalized = intervals.length > 1 ? intervals : [120, 120, 120, 120];
  const min = Math.min(...normalized);
  const max = Math.max(...normalized);
  const range = Math.max(max - min, 1);
  const padding = 22;

  context.strokeStyle = "rgba(159, 180, 187, 0.35)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, y + height - padding);
  context.lineTo(x + width, y + height - padding);
  context.stroke();

  context.beginPath();
  normalized.forEach((value, index) => {
    const px = x + padding + (index / Math.max(normalized.length - 1, 1)) * (width - padding * 2);
    const py = y + height - padding - ((value - min) / range) * (height - padding * 2);
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  });
  context.strokeStyle = "#64f5e7";
  context.lineWidth = 5;
  context.stroke();

  normalized.forEach((value, index) => {
    const px = x + padding + (index / Math.max(normalized.length - 1, 1)) * (width - padding * 2);
    const py = y + height - padding - ((value - min) / range) * (height - padding * 2);
    context.fillStyle = "#ecfeff";
    context.beginPath();
    context.arc(px, py, 5, 0, Math.PI * 2);
    context.fill();
  });
}
