"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  formatDateTime,
  formatMs,
  formatPercent,
  getPatternLabel,
  getTrillGroupLabel,
  getVariantLabel,
  isTrillGroupVariant,
  readMeasureHistory,
  TRILL_GROUP_VARIANTS,
  type MeasureHistoryEntry,
  type MeasureVariant,
  type TrillGroupVariant,
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
  averageYeontaTransitionMs: number | null;
  yeontaTransitionStdDevMs: number | null;
};

type StatMetric = {
  label: string;
  value: string;
};

const FILTER_LINKS: Array<{ label: string; href: string; description: string }> = [
  { label: "트릴", href: "/stats?pattern=trill", description: "왼손 · 오른손 · 양손 기록을 한눈에 봐요." },
  { label: "드르륵", href: "/stats?pattern=druruk", description: "123456 / 654321 단계 기록을 비교해요." },
  { label: "연타", href: "/stats?pattern=yeonta", description: "전환 딜레이와 안정감을 확인해요." },
];

export default function StatsPage() {
  return (
    <Suspense
      fallback={
        <main className="page-main">
          <section className="page-section">
            <article className="panel simple-panel">
              <p className="section-label">STATS</p>
              <h1 className="section-title">통계를 불러오는 중이에요</h1>
            </article>
          </section>
        </main>
      }
    >
      <StatsPageContent />
    </Suspense>
  );
}

function StatsPageContent() {
  const searchParams = useSearchParams();
  const [history, setHistory] = useState<MeasureHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState("");

  const patternParam = searchParams.get("pattern");
  const variantParam = searchParams.get("variant");
  const activePattern = patternParam ? getPatternDefinition(patternParam).key : null;
  const activeVariant = isMeasureVariant(variantParam) ? variantParam : null;
  const trillGroupFromQuery = activePattern === "trill" && isTrillGroupVariant(variantParam) ? variantParam : "left";
  const [selectedTrillGroup, setSelectedTrillGroup] = useState<TrillGroupVariant>(trillGroupFromQuery);

  useEffect(() => {
    setSelectedTrillGroup(trillGroupFromQuery);
  }, [trillGroupFromQuery]);

  useEffect(() => {
    const sync = () => {
      setHistory(readMeasureHistory());
    };

    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const patternHistory = useMemo(() => {
    if (!activePattern) return [];
    return history.filter((entry) => entry.pattern === activePattern);
  }, [activePattern, history]);

  const filteredHistory = useMemo(() => {
    if (!activePattern) return [];

    if (activePattern === "trill") {
      return patternHistory.filter((entry) => entry.variant === selectedTrillGroup);
    }

    return patternHistory.filter((entry) => {
      if (!activeVariant) return true;
      if (activePattern === "druruk") {
        if (activeVariant === "1234" && !(entry.variant === "1234" || entry.variant === "left")) return false;
        if (activeVariant === "4321" && !(entry.variant === "4321" || entry.variant === "right")) return false;
        if (activeVariant === "both") return false;
      } else if (entry.variant !== activeVariant) {
        return false;
      }
      return true;
    });
  }, [activePattern, activeVariant, patternHistory, selectedTrillGroup]);

  const groupSummaries = useMemo(() => {
    if (activePattern !== "trill") return [];
    return TRILL_GROUP_VARIANTS.map((group) => {
      const entries = patternHistory.filter((entry) => entry.variant === group);
      return {
        group,
        entries,
        summary: buildStatsSummary(entries),
      };
    });
  }, [activePattern, patternHistory]);

  const summary = useMemo(() => buildStatsSummary(filteredHistory), [filteredHistory]);
  const resolvedSelectedId = useMemo(() => {
    if (!filteredHistory.length) return null;
    if (selectedId && filteredHistory.some((entry) => entry.id === selectedId)) return selectedId;
    return filteredHistory[0]?.id ?? null;
  }, [filteredHistory, selectedId]);

  const selectedRun = useMemo(
    () => filteredHistory.find((entry) => entry.id === resolvedSelectedId) ?? filteredHistory[0] ?? null,
    [filteredHistory, resolvedSelectedId],
  );

  const recentTopRuns = useMemo(() => filteredHistory.slice(0, 3), [filteredHistory]);
  const filterTitle = getFilterTitle(activePattern, activePattern === "trill" ? selectedTrillGroup : activeVariant);
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
    setShareStatus("선택한 기록 이미지를 다운로드했어요.");
  }

  async function downloadOverallShareCard() {
    if (filteredHistory.length === 0 || !activePattern) return;

    if (activePattern === "trill") {
      downloadTrillGroupShareCard(groupSummaries);
      return;
    }

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
    setShareStatus("현재 필터 기준 통계 이미지를 다운로드했어요.");
  }

  function downloadTrillGroupShareCard(groups: Array<{ group: TrillGroupVariant; entries: MeasureHistoryEntry[]; summary: StatsSummary }>) {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1800;
    const context = canvas.getContext("2d");
    if (!context) return;

    paintBackground(context, canvas.width, canvas.height);

    context.fillStyle = "#64f5e7";
    context.font = "700 34px Arial";
    context.fillText("TRILL LAB", 100, 120);

    context.fillStyle = "#ecfeff";
    context.font = "800 84px Arial";
    context.fillText("트릴 그룹 요약", 100, 230);

    context.fillStyle = "#9fb4bb";
    context.font = "600 32px Arial";
    context.fillText("왼손 · 오른손 · 양손 기록을 한 세트로 묶어서 내보내요.", 102, 282);

    groups.forEach((groupData, index) => {
      const top = 360 + index * 420;
      drawGroupSummaryBlock(context, {
        x: 100,
        y: top,
        width: 1400,
        title: getTrillGroupLabel(groupData.group),
        summary: groupData.summary,
        latestEntry: groupData.entries[0] ?? null,
      });
    });

    context.fillStyle = "#9fb4bb";
    context.font = "600 28px Arial";
    context.fillText("각 그룹의 최근 기록과 핵심 지표를 한 장으로 공유할 수 있어요.", 100, 1720);

    downloadCanvas(canvas, "trill-lab-stats-trill-groups.png");
    setShareStatus("트릴 3개 그룹 요약 이미지를 다운로드했어요.");
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
        <strong>카테고리별 통계</strong>
        <span className="compact-summary-divider">·</span>
        <span>트릴 · 드르륵 · 연타 중 원하는 패턴을 고르고 기록을 확인해요.</span>
      </section>

      <section className="page-section pattern-select-grid" aria-label="통계 필터 선택">
        {FILTER_LINKS.map((filter) => {
          const isActive = filter.href === buildActiveFilterHref(activePattern, activeVariant);
          return (
            <Link key={filter.href} href={filter.href} className={`pattern-select-card panel ${isActive ? "is-active" : ""}`}>
              <strong>{filter.label}</strong>
              <p>{filter.description}</p>
              <span>{isActive ? "선택됨" : "통계 보기"}</span>
            </Link>
          );
        })}
      </section>

      {!activePattern ? (
        <section className="page-section">
          <article className="panel simple-panel">
            <p className="section-label">카테고리를 선택하세요</p>
            <h2 className="section-title">전체 통계는 숨겼어요</h2>
            <p className="section-subtitle">위에서 트릴, 드르륵, 연타 중 하나를 선택해 주세요.</p>
          </article>
        </section>
      ) : patternHistory.length === 0 ? (
        <section className="page-section">
          <article className="panel simple-panel">
            <p className="section-label">아직 데이터가 없어요</p>
            <h2 className="section-title">이 카테고리에는 기록이 없어요</h2>
            <p className="section-subtitle">다른 패턴으로 바꾸거나 측정을 한 번 더 완료해보세요.</p>
          </article>
        </section>
      ) : (
        <>
          {activePattern === "trill" ? (
            <section className="page-section trill-group-section">
              <div className="section-heading-row">
                <div>
                  <p className="section-label">트릴 그룹 요약</p>
                  <h2 className="section-title">손 조합별로 기록을 나눠서 보세요</h2>
                </div>
                <p className="section-subtitle">상단 그룹을 누르면 아래 기록 목록과 상세 카드가 바로 필터링돼요.</p>
              </div>
              <div className="trill-group-grid">
                {groupSummaries.map((groupData) => {
                  const isActive = groupData.group === selectedTrillGroup;
                  return (
                    <button
                      key={groupData.group}
                      type="button"
                      className={`trill-group-card ${isActive ? "is-active" : ""}`}
                      onClick={() => {
                        setSelectedTrillGroup(groupData.group);
                        setSelectedId(groupData.entries[0]?.id ?? null);
                      }}
                    >
                      <div className="trill-group-card-header">
                        <strong>{getTrillGroupLabel(groupData.group)}</strong>
                        <span>{groupData.summary.totalRuns}회</span>
                      </div>
                      <div className="trill-group-card-metrics">
                        <StatCard label="최고 BPM" value={String(groupData.summary.bestBpm || 0)} compact />
                        <StatCard label="평균 BPM" value={String(groupData.summary.averageBpm || 0)} compact />
                        <StatCard label="평균 정확도" value={`${groupData.summary.averageAccuracy}%`} compact />
                        <StatCard label="최고 일정함" value={`${groupData.summary.bestConsistency}%`} compact />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="stats-overview-grid page-section">
              {getOverviewCards(summary, activePattern).map((card) => (
                <StatCard key={card.label} label={card.label} value={card.value} />
              ))}
            </section>
          )}

          {activePattern === "trill" && filteredHistory.length > 0 ? (
            <section className="page-section stats-overview-grid stats-overview-grid-compact">
              {getOverviewCards(summary, activePattern).map((card) => (
                <StatCard key={card.label} label={card.label} value={card.value} compact />
              ))}
            </section>
          ) : null}

          {filteredHistory.length === 0 ? (
            <section className="page-section">
              <article className="panel simple-panel">
                <p className="section-label">선택한 그룹의 데이터가 없어요</p>
                <h2 className="section-title">다른 그룹을 눌러 보거나 측정을 더 진행해 주세요</h2>
                <p className="section-subtitle">트릴은 왼손, 오른손, 양손을 각각 따로 저장해요.</p>
              </article>
            </section>
          ) : (
            <section className="stats-layout page-section">
              <article className="panel stack-gap-lg">
                <div className="section-heading-row">
                  <div>
                    <p className="section-label">기록 목록</p>
                    <h2 className="section-title">{activePattern === "trill" ? `${getTrillGroupLabel(selectedTrillGroup)} 기록` : "확인할 기록을 선택하세요"}</h2>
                  </div>
                  <p className="section-subtitle">아래 목록은 현재 선택한 {activePattern === "trill" ? "그룹" : "패턴 필터"}만 보여줘요.</p>
                </div>
                <div className="history-list history-list-scroll">
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
                      <span>{activePattern === "trill" ? "3개 그룹 세트 내보내기" : "현재 필터 통계 공유"}</span>
                    </div>
                    <div>
                      <p className="section-label">필터 기반 요약</p>
                      <h2 className="section-title">{activePattern === "trill" ? "트릴 3개 그룹 요약 이미지" : "현재 필터 통계 이미지"}</h2>
                      <p className="section-subtitle">
                        {activePattern === "trill"
                          ? "왼손, 오른손, 양손 요약을 한 장으로 묶어서 내려받아요. 단일 기록 이미지와는 별도로 관리돼요."
                          : "현재 페이지 필터 그대로 이미지가 만들어져요. 드르륵은 1234/4321 각각 따로 뽑을 수 있어요."}
                      </p>
                    </div>
                    <div className="share-card-metrics">
                      {(activePattern === "trill"
                        ? groupSummaries.map((groupData) => ({
                            label: `${getTrillGroupLabel(groupData.group)} 평균 BPM`,
                            value: String(groupData.summary.averageBpm || 0),
                          }))
                        : getOverviewCards(summary, activePattern)
                      ).slice(0, 4).map((card) => (
                        <StatCard key={card.label} label={card.label} value={card.value} compact />
                      ))}
                    </div>
                  </div>

                  <div className="share-actions share-actions-row">
                    <button type="button" className="primary-button" onClick={() => downloadRunShareCard(selectedRun)}>
                      선택한 기록 이미지 다운로드
                    </button>
                    <button type="button" className="secondary-button" onClick={downloadOverallShareCard}>
                      {activePattern === "trill" ? "트릴 3개 그룹 요약 다운로드" : "현재 필터 통계 이미지 다운로드"}
                    </button>
                  </div>
                  {shareStatus ? <span className="hint-text">{shareStatus}</span> : null}
                </article>
              ) : null}
            </section>
          )}
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
  return value === "left" || value === "right" || value === "both" || value === "1234" || value === "4321";
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

function buildStatsSummary(entries: MeasureHistoryEntry[]): StatsSummary {
  if (entries.length === 0) {
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
      averageYeontaTransitionMs: null,
      yeontaTransitionStdDevMs: null,
    };
  }

  const totalRuns = entries.length;
  const bestBpm = Math.max(...entries.map((entry) => entry.result.bpm));
  const averageBpm = Math.round(entries.reduce((sum, entry) => sum + entry.result.bpm, 0) / totalRuns);
  const bestConsistency = Math.max(...entries.map((entry) => entry.result.consistencyScore));
  const averageAccuracy = Math.round(entries.reduce((sum, entry) => sum + entry.result.accuracy, 0) / totalRuns);

  const drurukEntries = entries.filter((entry) => entry.pattern === "druruk" && entry.result.druruk);
  const runDurations = drurukEntries.flatMap((entry) => entry.result.druruk?.runDurations ?? []);
  const stepIntervals = drurukEntries.flatMap((entry) => entry.result.druruk?.stepIntervals ?? []);
  const completedDrurukRuns = drurukEntries.reduce((sum, entry) => sum + (entry.result.druruk?.completedRuns ?? 0), 0);
  const yeontaTransitionIntervals = entries.flatMap((entry) => entry.result.yeonta?.transitionIntervals ?? []);

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
    averageYeontaTransitionMs: average(yeontaTransitionIntervals),
    yeontaTransitionStdDevMs: standardDeviation(yeontaTransitionIntervals),
  };
}

function getFilterTitle(pattern: PatternKey | null, variant: MeasureVariant | null) {
  if (pattern === "trill" && variant && isTrillGroupVariant(variant)) return `트릴 ${getTrillGroupLabel(variant)} 통계`;
  if (pattern === "druruk" && variant) return `드르륵 ${getVariantLabel(variant, pattern)} 통계`;
  if (pattern) return `${getPatternDefinition(pattern).label} 통계`;
  return "카테고리별 통계";
}

function buildActiveFilterHref(pattern: PatternKey | null, variant: MeasureVariant | null) {
  const params = new URLSearchParams();
  if (pattern) params.set("pattern", pattern);
  if (pattern && pattern !== "trill" && variant) params.set("variant", variant);
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
  if (entry.pattern === "yeonta") {
    return `전환 딜레이 ${formatMs(entry.result.yeonta?.averageTransitionIntervalMs ?? null)} · 일정함 ${entry.result.consistencyScore}%`;
  }
  return `정확도 ${formatPercent(entry.result.accuracy)} · 일정함 ${entry.result.consistencyScore}%`;
}

function getRunMetricCards(entry: MeasureHistoryEntry): StatMetric[] {
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

  if (entry.pattern === "yeonta") {
    return [
      { label: "정확도", value: formatPercent(entry.result.accuracy) },
      { label: "일정함", value: `${entry.result.consistencyScore}%` },
      { label: "전환 딜레이", value: formatMs(entry.result.yeonta?.averageTransitionIntervalMs ?? null) },
      { label: "전환 편차", value: formatMs(entry.result.yeonta?.transitionIntervalStdDevMs ?? null) },
      { label: "최대 스트릭", value: String(entry.result.peakStreak) },
      { label: "평균 간격", value: formatMs(entry.result.averageIntervalMs) },
      { label: "유효 입력", value: String(entry.result.validHits) },
      { label: "무효 입력", value: String(entry.result.invalidHits) },
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

function getOverviewCards(summary: StatsSummary, activePattern: PatternKey | null): StatMetric[] {
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

  if (activePattern === "yeonta") {
    return [
      { label: "총 측정 수", value: String(summary.totalRuns) },
      { label: "최고 BPM", value: String(summary.bestBpm) },
      { label: "평균 BPM", value: String(summary.averageBpm) },
      { label: "평균 전환 딜레이", value: formatMs(summary.averageYeontaTransitionMs) },
      { label: "전환 편차", value: formatMs(summary.yeontaTransitionStdDevMs) },
      { label: "최고 일정함", value: `${summary.bestConsistency}%` },
    ];
  }

  return [
    { label: "총 측정 수", value: String(summary.totalRuns) },
    { label: "최고 BPM", value: String(summary.bestBpm) },
    { label: "평균 BPM", value: String(summary.averageBpm) },
    { label: "평균 정확도", value: `${summary.averageAccuracy}%` },
    { label: "최고 일정함", value: `${summary.bestConsistency}%` },
    { label: "평균 간격", value: formatMs(summary.averageBpm ? 60000 / Math.max(summary.averageBpm * 2, 1) : null) },
  ];
}

function getSummaryMetricCards(summary: StatsSummary, activePattern: PatternKey | null) {
  return getOverviewCards(summary, activePattern);
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

function drawGroupSummaryBlock(
  context: CanvasRenderingContext2D,
  params: { x: number; y: number; width: number; title: string; summary: StatsSummary; latestEntry: MeasureHistoryEntry | null },
) {
  context.fillStyle = "rgba(255, 255, 255, 0.04)";
  roundRect(context, params.x, params.y, params.width, 320, 28);
  context.fill();
  context.strokeStyle = "rgba(100, 245, 231, 0.16)";
  context.stroke();

  context.fillStyle = "#ecfeff";
  context.font = "800 52px Arial";
  context.fillText(params.title, params.x + 36, params.y + 74);

  context.fillStyle = "#9fb4bb";
  context.font = "600 28px Arial";
  context.fillText(`${params.summary.totalRuns}회 측정 · 평균 정확도 ${params.summary.averageAccuracy}% · 최고 일정함 ${params.summary.bestConsistency}%`, params.x + 36, params.y + 120);

  const metrics: StatMetric[] = [
    { label: "최고 BPM", value: String(params.summary.bestBpm) },
    { label: "평균 BPM", value: String(params.summary.averageBpm) },
    { label: "평균 정확도", value: `${params.summary.averageAccuracy}%` },
    { label: "최고 일정함", value: `${params.summary.bestConsistency}%` },
  ];

  metrics.forEach((metric, index) => {
    drawMetric(context, {
      x: params.x + 36 + index * 330,
      y: params.y + 154,
      w: 292,
      h: 126,
      label: metric.label,
      value: metric.value,
    });
  });

  if (params.latestEntry) {
    context.fillStyle = "#9fb4bb";
    context.font = "600 24px Arial";
    context.fillText(`최근 기록 ${getShareHeadline(params.latestEntry)} · ${formatDateTime(params.latestEntry.createdAt)}`, params.x + 36, params.y + 304);
  }
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
