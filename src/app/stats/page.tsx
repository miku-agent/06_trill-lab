"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatDateTime,
  formatMs,
  formatPercent,
  getVariantLabel,
  readMeasureHistory,
  type MeasureHistoryEntry,
} from "../lib/measure-history";

export default function StatsPage() {
  const [history, setHistory] = useState<MeasureHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string>("");

  useEffect(() => {
    const sync = () => {
      const next = readMeasureHistory();
      setHistory(next);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    };

    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const selectedRun = useMemo(() => history.find((entry) => entry.id === selectedId) ?? history[0] ?? null, [history, selectedId]);

  const summary = useMemo(() => {
    if (history.length === 0) {
      return {
        totalRuns: 0,
        bestBpm: 0,
        averageBpm: 0,
        bestConsistency: 0,
      };
    }

    const totalRuns = history.length;
    const bestBpm = Math.max(...history.map((entry) => entry.result.bpm));
    const averageBpm = Math.round(history.reduce((sum, entry) => sum + entry.result.bpm, 0) / totalRuns);
    const best일정함 = Math.max(...history.map((entry) => entry.result.consistencyScore));

    return { totalRuns, bestBpm, averageBpm, best일정함 };
  }, [history]);

  async function downloadShareCard(entry: MeasureHistoryEntry) {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const context = canvas.getContext("2d");
    if (!context) return;

    const { width, height } = canvas;
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
    context.arc(1020, 260, 220, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(100, 245, 231, 0.18)";
    context.lineWidth = 2;
    roundRect(context, 64, 64, width - 128, height - 128, 36);
    context.stroke();

    context.fillStyle = "#64f5e7";
    context.font = "700 34px Arial";
    context.fillText("TRILL LAB", 110, 140);

    context.fillStyle = "#ecfeff";
    context.font = "800 120px Arial";
    context.fillText(`${entry.result.bpm} BPM`, 110, 310);

    context.fillStyle = "#9fb4bb";
    context.font = "600 42px Arial";
    context.fillText(`${getVariantLabel(entry.variant)} · ${entry.primaryKey} / ${entry.secondaryKey}`, 112, 372);

    drawMetric(context, { x: 110, y: 460, w: 300, h: 180, label: "정확도", value: formatPercent(entry.result.accuracy) });
    drawMetric(context, { x: 445, y: 460, w: 300, h: 180, label: "일정함", value: `${entry.result.consistencyScore}%` });
    drawMetric(context, { x: 780, y: 460, w: 300, h: 180, label: "최대 스트릭", value: String(entry.result.peakStreak) });
    drawMetric(context, { x: 110, y: 674, w: 300, h: 180, label: "평균 간격", value: formatMs(entry.result.averageIntervalMs) });
    drawMetric(context, { x: 445, y: 674, w: 300, h: 180, label: "최고 속도", value: formatMs(entry.result.fastestIntervalMs) });
    drawMetric(context, { x: 780, y: 674, w: 300, h: 180, label: "최저 속도", value: formatMs(entry.result.slowestIntervalMs) });

    context.fillStyle = "rgba(236, 254, 255, 0.96)";
    context.font = "700 38px Arial";
    context.fillText("간격 프로필", 110, 972);

    drawIntervals(context, entry.result.intervals, 110, 1010, 970, 260);

    context.fillStyle = "#9fb4bb";
    context.font = "600 32px Arial";
    context.fillText(`저장 시각 ${formatDateTime(entry.createdAt)}`, 110, 1350);
    context.fillText("트릴을 측정하고, 안정성을 확인하고, 최고 기록을 공유해보세요.", 110, 1402);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `trill-lab-${entry.result.bpm}bpm.png`;
    link.click();
    setShareStatus("공유 이미지가 다운로드되었어요.");
  }

  return (
    <main className="page-main">
      <section className="page-section compact-hero">
        <div>
          <p className="eyebrow">STATS</p>
          <h1 className="page-title">내 트릴 기록</h1>
        </div>
        <div className="status-pill">{history.length}회 측정</div>
      </section>

      <section className="page-section compact-summary panel">
        <strong>자동 저장 기록</strong>
        <span className="compact-summary-divider">·</span>
        <span>측정이 끝날 때마다 기록이 브라우저에 저장돼요.</span>
      </section>

      {history.length === 0 ? (
        <section className="page-section">
          <article className="panel simple-panel">
            <p className="section-label">아직 데이터가 없어요</p>
            <h2 className="section-title">첫 번째 측정을 완료해보세요</h2>
            <p className="section-subtitle">측정 모드에서 한 번 완료하면 여기서 기록과 공유 카드를 볼 수 있어요.</p>
          </article>
        </section>
      ) : (
        <>
          <section className="stats-overview-grid page-section">
            <StatCard label="총 측정 수" value={String(summary.totalRuns)} />
            <StatCard label="최고 BPM" value={`${summary.bestBpm}`} />
            <StatCard label="평균 BPM" value={`${summary.averageBpm}`} />
            <StatCard label="최고 일정함" value={`${summary.best일정함}%`} />
          </section>

          <section className="stats-layout page-section">
            <article className="panel stack-gap-lg">
              <div>
                <p className="section-label">최근 기록</p>
                <h2 className="section-title">확인할 기록을 선택하세요</h2>
              </div>
              <div className="history-list">
                {history.map((entry) => {
                  const isActive = selectedRun?.id === entry.id;
                  return (
                    <button key={entry.id} type="button" className={`history-card ${isActive ? "is-active" : ""}`} onClick={() => setSelectedId(entry.id)}>
                      <div>
                        <strong>{entry.result.bpm} BPM</strong>
                        <span>{getVariantLabel(entry.variant)} · {entry.primaryKey} / {entry.secondaryKey}</span>
                      </div>
                      <div className="history-meta">
                        <span>{entry.result.consistencyScore}%% 일정함</span>
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
                    <h2 className="share-bpm">{selectedRun.result.bpm} BPM</h2>
                    <p className="section-subtitle">{getVariantLabel(selectedRun.variant)} · {selectedRun.primaryKey} / {selectedRun.secondaryKey}</p>
                  </div>
                  <div className="share-card-metrics">
                    <StatCard label="정확도" value={formatPercent(selectedRun.result.accuracy)} compact />
                    <StatCard label="일정함" value={`${selectedRun.result.consistencyScore}%`} compact />
                    <StatCard label="최대 스트릭" value={String(selectedRun.result.peakStreak)} compact />
                    <StatCard label="평균 간격" value={formatMs(selectedRun.result.averageIntervalMs)} compact />
                  </div>
                </div>

                <div className="interval-stats-grid">
                  <StatCard label="유효 입력" value={String(selectedRun.result.validHits)} compact />
                  <StatCard label="무효 입력" value={String(selectedRun.result.invalidHits)} compact />
                  <StatCard label="최고 속도" value={formatMs(selectedRun.result.fastestIntervalMs)} compact />
                  <StatCard label="최저 속도" value={formatMs(selectedRun.result.slowestIntervalMs)} compact />
                </div>

                <div className="share-actions">
                  <button type="button" className="primary-button" onClick={() => downloadShareCard(selectedRun)}>
                    공유 이미지 다운로드
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

function drawIntervals(context: CanvasRenderingContext2D, intervals: number[], x: number, y: number, width: number, height: number) {
  context.fillStyle = "rgba(255, 255, 255, 0.04)";
  roundRect(context, x, y, width, height, 30);
  context.fill();

  if (intervals.length <= 1) return;

  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  const range = Math.max(max - min, 1);
  const padding = 30;

  context.strokeStyle = "rgba(159, 180, 187, 0.25)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + padding, y + padding);
  context.lineTo(x + padding, y + height - padding);
  context.lineTo(x + width - padding, y + height - padding);
  context.stroke();

  context.strokeStyle = "#64f5e7";
  context.lineWidth = 5;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();

  intervals.forEach((value, index) => {
    const pointX = x + padding + (index / Math.max(intervals.length - 1, 1)) * (width - padding * 2);
    const pointY = y + height - padding - ((value - min) / range) * (height - padding * 2);
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  });

  context.stroke();
}
