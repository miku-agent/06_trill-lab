"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GameState = "idle" | "playing" | "ended";
type EndMode = "firstMiss" | "timed";
type JudgmentType = "perfect" | "good" | "miss";
type LaneIndex = 0 | 1 | 2 | 3;
type KeyCaptureTarget = "left" | "right" | null;

type Note = {
  id: number;
  lane: LaneIndex;
  time: number;
  judged: boolean;
  judgment: JudgmentType | null;
};

type GameConfig = {
  bpm: number;
  subdivision: 1 | 2 | 4 | 8;
  speed: number;
  endMode: EndMode;
  duration: number;
  leftKey: string;
  rightKey: string;
};

type GameStats = {
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  totalNotes: number;
};

const DEFAULT_CONFIG: GameConfig = {
  bpm: 150,
  subdivision: 4,
  speed: 6.5,
  endMode: "timed",
  duration: 30,
  leftKey: "a",
  rightKey: "'",
};

const PRACTICE_LANES: LaneIndex[] = [0, 1, 2, 3];
const ACTIVE_TRILL_LANES: LaneIndex[] = [1, 2];
const LEAD_IN_MS = 1800;
const FIRST_MISS_BUFFER_MS = 5000;
const PERFECT_WINDOW_MS = 45;
const GOOD_WINDOW_MS = 95;
const MISS_WINDOW_MS = 150;
const NOTE_HEIGHT_PX = 20;
const RAIL_HEIGHT_PX = 520;
const JUDGMENT_LINE_Y = 430;
const MIN_TRAVEL_MS = 520;
const MAX_TRAVEL_MS = 2100;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatKeyLabel(key: string) {
  if (key === " ") return "SPACE";
  return key.length === 1 ? key.toUpperCase() : key.toUpperCase();
}

function createNotes(config: GameConfig): Note[] {
  const beatMs = 60000 / config.bpm;
  const intervalMs = beatMs / config.subdivision;
  const totalMs =
    config.endMode === "timed"
      ? config.duration * 1000 + LEAD_IN_MS + intervalMs * 2
      : 60000;

  const notes: Note[] = [];
  let laneCursor = 0;
  let currentTime = LEAD_IN_MS;
  let id = 0;

  while (currentTime <= totalMs) {
    notes.push({
      id,
      lane: ACTIVE_TRILL_LANES[laneCursor % ACTIVE_TRILL_LANES.length],
      time: currentTime,
      judged: false,
      judgment: null,
    });

    id += 1;
    laneCursor += 1;
    currentTime += intervalMs;
  }

  return notes;
}

function getTravelMs(speed: number) {
  const normalized = clamp(speed, 0, 10) / 10;
  const eased = Math.pow(normalized, 0.78);
  return Math.round(clamp(MAX_TRAVEL_MS - eased * (MAX_TRAVEL_MS - MIN_TRAVEL_MS), MIN_TRAVEL_MS, MAX_TRAVEL_MS));
}

function getAccuracy(stats: GameStats) {
  if (stats.totalNotes === 0) return 0;
  return ((stats.perfect + stats.good) / stats.totalNotes) * 100;
}

export default function PracticePage() {
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState<GameStats>({
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    totalNotes: 0,
  });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastJudgment, setLastJudgment] = useState<JudgmentType | null>(null);
  const [keyCaptureTarget, setKeyCaptureTarget] = useState<KeyCaptureTarget>(null);

  const startAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const notesRef = useRef<Note[]>([]);
  const lastJudgmentTimeoutRef = useRef<number | null>(null);

  const travelMs = useMemo(() => getTravelMs(config.speed), [config.speed]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const resetJudgmentToast = useCallback((judgment: JudgmentType) => {
    setLastJudgment(judgment);

    if (lastJudgmentTimeoutRef.current !== null) {
      window.clearTimeout(lastJudgmentTimeoutRef.current);
    }

    lastJudgmentTimeoutRef.current = window.setTimeout(() => {
      setLastJudgment(null);
      lastJudgmentTimeoutRef.current = null;
    }, 280);
  }, []);

  const finishGame = useCallback(() => {
    stopLoop();
    setGameState("ended");
  }, [stopLoop]);

  const applyJudgment = useCallback(
    (noteId: number, judgment: JudgmentType) => {
      let applied = false;

      setNotes((prev) => {
        const next = prev.map((note) => {
          if (note.id !== noteId || note.judged) {
            return note;
          }

          applied = true;
          return {
            ...note,
            judged: true,
            judgment,
          };
        });

        notesRef.current = next;
        return next;
      });

      if (!applied) return false;

      setStats((prev) => {
        if (judgment === "miss") {
          return {
            ...prev,
            combo: 0,
            miss: prev.miss + 1,
          };
        }

        const combo = prev.combo + 1;
        return {
          ...prev,
          combo,
          maxCombo: Math.max(prev.maxCombo, combo),
          perfect: judgment === "perfect" ? prev.perfect + 1 : prev.perfect,
          good: judgment === "good" ? prev.good + 1 : prev.good,
        };
      });

      resetJudgmentToast(judgment);
      return true;
    },
    [resetJudgmentToast],
  );

  const startGame = useCallback(() => {
    const nextNotes = createNotes(config);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    setStats({
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      miss: 0,
      totalNotes: nextNotes.length,
    });
    setElapsedMs(0);
    setLastJudgment(null);
    setGameState("playing");
    startAtRef.current = performance.now();
  }, [config]);

  const resetToIdle = useCallback(() => {
    stopLoop();
    notesRef.current = [];
    setElapsedMs(0);
    setNotes([]);
    setLastJudgment(null);
    setStats({
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      miss: 0,
      totalNotes: 0,
    });
    setGameState("idle");
  }, [stopLoop]);

  useEffect(() => {
    if (gameState !== "playing") {
      stopLoop();
      return;
    }

    const tick = () => {
      const now = performance.now();
      const elapsed = now - startAtRef.current;
      setElapsedMs(elapsed);

      const staleMisses = notesRef.current.filter(
        (note) => !note.judged && elapsed - note.time > MISS_WINDOW_MS,
      );

      if (staleMisses.length > 0) {
        staleMisses.forEach((note) => {
          applyJudgment(note.id, "miss");
        });

        if (config.endMode === "firstMiss") {
          finishGame();
          return;
        }
      }

      if (config.endMode === "timed" && elapsed >= config.duration * 1000 + LEAD_IN_MS) {
        finishGame();
        return;
      }

      if (
        config.endMode === "firstMiss" &&
        elapsed > LEAD_IN_MS + FIRST_MISS_BUFFER_MS &&
        notesRef.current.every((note) => note.judged)
      ) {
        finishGame();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [applyJudgment, config.duration, config.endMode, finishGame, gameState, stopLoop]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (keyCaptureTarget) {
        event.preventDefault();
        if (key === "escape") {
          setKeyCaptureTarget(null);
          return;
        }

        setConfig((prev) => ({
          ...prev,
          [keyCaptureTarget === "left" ? "leftKey" : "rightKey"]: event.key.length === 1 ? key : event.key,
        }));
        setKeyCaptureTarget(null);
        return;
      }

      if (gameState !== "playing") return;

      const lane =
        key === config.leftKey.toLowerCase()
          ? ACTIVE_TRILL_LANES[0]
          : key === config.rightKey.toLowerCase()
            ? ACTIVE_TRILL_LANES[1]
            : null;

      if (lane === null) return;

      event.preventDefault();

      const currentTime = performance.now() - startAtRef.current;
      const candidates = notesRef.current
        .filter((note) => note.lane === lane && !note.judged)
        .map((note) => ({ note, delta: currentTime - note.time }))
        .filter(({ delta }) => Math.abs(delta) <= MISS_WINDOW_MS)
        .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));

      const target = candidates[0];
      if (!target) return;

      const distance = Math.abs(target.delta);
      const judgment: JudgmentType =
        distance <= PERFECT_WINDOW_MS
          ? "perfect"
          : distance <= GOOD_WINDOW_MS
            ? "good"
            : "miss";

      const applied = applyJudgment(target.note.id, judgment);
      if (!applied) return;

      if (config.endMode === "firstMiss" && judgment === "miss") {
        finishGame();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyJudgment, config.leftKey, config.rightKey, config.endMode, finishGame, gameState, keyCaptureTarget]);

  useEffect(() => {
    return () => {
      stopLoop();
      if (lastJudgmentTimeoutRef.current !== null) {
        window.clearTimeout(lastJudgmentTimeoutRef.current);
      }
    };
  }, [stopLoop]);

  const accuracy = getAccuracy(stats);
  const remainingSeconds =
    config.endMode === "timed"
      ? Math.max(0, Math.ceil((config.duration * 1000 + LEAD_IN_MS - elapsedMs) / 1000))
      : null;

  const leadInRemaining = Math.max(0, Math.ceil((LEAD_IN_MS - elapsedMs) / 1000));

  return (
    <main className="page-main">
      <section className="page-section compact-hero">
        <div>
          <p className="eyebrow">PRACTICE MODE</p>
          <h1 className="page-title">연습 모드</h1>
          <p className="section-subtitle">
            4레인 베이스 위에서 트릴을 안정적으로 연습하는 리듬게임식 MVP예요.
          </p>
        </div>
        <div className="status-pill">TRILL PRACTICE</div>
      </section>

      <section className="page-section stack-gap-lg">
        <article className="panel practice-panel">
          <div className="practice-control-header">
            <div>
              <p className="section-label">설정</p>
              <h2 className="section-title">트릴 연습 세팅</h2>
            </div>
            <p className="inline-note">
              기본 구조는 4레인이지만 현재 플레이 입력은 중앙 2레인 트릴에 맞춰져 있어요.
            </p>
          </div>

          <div className="practice-config-grid">
            <label className="practice-field">
              <span>BPM</span>
              <input
                className="practice-input"
                type="number"
                min={60}
                max={320}
                value={config.bpm}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, bpm: clamp(Number(event.target.value) || 60, 60, 320) }))
                }
                disabled={gameState === "playing"}
              />
            </label>

            <label className="practice-field">
              <span>박자 분할</span>
              <select
                className="practice-input"
                value={config.subdivision}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    subdivision: Number(event.target.value) as GameConfig["subdivision"],
                  }))
                }
                disabled={gameState === "playing"}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={8}>8</option>
              </select>
            </label>

            <label className="practice-field">
              <span>노트 속도</span>
              <input
                className="practice-input"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={config.speed}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, speed: clamp(Number(event.target.value) || 0, 0, 10) }))
                }
                disabled={gameState === "playing"}
              />
              <small className="practice-field-hint">DJMAX처럼 체감 스크롤 속도 기준으로 더 빠르게 매핑했어요.</small>
            </label>

            <label className="practice-field">
              <span>종료 모드</span>
              <select
                className="practice-input"
                value={config.endMode}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, endMode: event.target.value as EndMode }))
                }
                disabled={gameState === "playing"}
              >
                <option value="timed">시간 제한</option>
                <option value="firstMiss">첫 미스 시 종료</option>
              </select>
            </label>

            <label className="practice-field">
              <span>시간 (초)</span>
              <input
                className="practice-input"
                type="number"
                min={10}
                max={180}
                step={5}
                value={config.duration}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, duration: clamp(Number(event.target.value) || 10, 10, 180) }))
                }
                disabled={gameState !== "idle" || config.endMode !== "timed"}
              />
            </label>

            <div className="practice-field">
              <span>왼쪽 키</span>
              <button
                type="button"
                className={`key-value-button${keyCaptureTarget === "left" ? " is-capturing" : ""}`}
                onClick={() => setKeyCaptureTarget("left")}
                disabled={gameState === "playing"}
              >
                {keyCaptureTarget === "left" ? "키 입력 중... (ESC 취소)" : formatKeyLabel(config.leftKey)}
              </button>
            </div>

            <div className="practice-field">
              <span>오른쪽 키</span>
              <button
                type="button"
                className={`key-value-button${keyCaptureTarget === "right" ? " is-capturing" : ""}`}
                onClick={() => setKeyCaptureTarget("right")}
                disabled={gameState === "playing"}
              >
                {keyCaptureTarget === "right" ? "키 입력 중... (ESC 취소)" : formatKeyLabel(config.rightKey)}
              </button>
            </div>
          </div>

          <div className="practice-actions-row">
            {gameState !== "playing" ? (
              <button type="button" className="primary-action-button" onClick={startGame}>
                연습 시작
              </button>
            ) : (
              <button type="button" className="ghost-action-button" onClick={finishGame}>
                지금 종료
              </button>
            )}

            <button type="button" className="ghost-action-button" onClick={resetToIdle}>
              초기화
            </button>
          </div>
        </article>

        <section className="practice-play-grid">
          <article className="panel practice-rail-panel">
            <div className="practice-rail-header">
              <div>
                <p className="section-label">PLAY FIELD</p>
                <h2 className="section-title">4레인 트릴 레일</h2>
              </div>
              <div className="practice-badge-row">
                <span className="practice-badge">ACTIVE: 2 / 3 레인</span>
                <span className="practice-badge">NOTE WIDTH: FULL</span>
              </div>
            </div>

            <div className="practice-rail" style={{ height: `${RAIL_HEIGHT_PX}px` }}>
              {PRACTICE_LANES.map((lane) => {
                const laneNotes = notes.filter((note) => note.lane === lane);
                const laneKey =
                  lane === ACTIVE_TRILL_LANES[0]
                    ? config.leftKey
                    : lane === ACTIVE_TRILL_LANES[1]
                      ? config.rightKey
                      : null;

                return (
                  <div
                    key={lane}
                    className={`practice-lane${ACTIVE_TRILL_LANES.includes(lane) ? " is-active" : " is-inactive"}`}
                  >
                    <div className="practice-lane-top">
                      <span>LANE {lane + 1}</span>
                      <strong>{laneKey ? formatKeyLabel(laneKey) : "-"}</strong>
                    </div>

                    {laneNotes.map((note) => {
                      const y =
                        JUDGMENT_LINE_Y - ((note.time - elapsedMs) / travelMs) * (JUDGMENT_LINE_Y - 24);

                      if (y < -NOTE_HEIGHT_PX || y > RAIL_HEIGHT_PX) {
                        return null;
                      }

                      return (
                        <div
                          key={note.id}
                          className={`practice-note${note.judged ? ` is-${note.judgment}` : ""}`}
                          style={{
                            top: `${y}px`,
                            height: `${NOTE_HEIGHT_PX}px`,
                          }}
                        />
                      );
                    })}

                    <div className="practice-key-floor">{laneKey ? formatKeyLabel(laneKey) : ""}</div>
                  </div>
                );
              })}

              <div className="practice-judgment-line" style={{ top: `${JUDGMENT_LINE_Y}px` }} />
            </div>

            <div className="practice-rail-help">
              {gameState === "playing" ? (
                leadInRemaining > 0 ? (
                  <span>시작 준비... {leadInRemaining}</span>
                ) : (
                  <span>
                    중앙 2레인에 맞춰 <strong>{formatKeyLabel(config.leftKey)}</strong> /{" "}
                    <strong>{formatKeyLabel(config.rightKey)}</strong> 를 번갈아 눌러주세요.
                  </span>
                )
              ) : (
                <span>연습을 시작하면 중앙 2레인에서 트릴 노트가 떨어져요.</span>
              )}
            </div>
          </article>

          <aside className="panel practice-stats-panel">
            <p className="section-label">LIVE STATS</p>
            <h2 className="section-title">실시간 판정</h2>

            <div className="stat-grid compact-stat-grid">
              <article className="stat-card">
                <strong>{stats.combo}</strong>
                <span>현재 콤보</span>
              </article>
              <article className="stat-card">
                <strong>{stats.maxCombo}</strong>
                <span>최대 콤보</span>
              </article>
              <article className="stat-card">
                <strong>{stats.perfect}</strong>
                <span>퍼펙트</span>
              </article>
              <article className="stat-card">
                <strong>{stats.good}</strong>
                <span>굿</span>
              </article>
              <article className="stat-card">
                <strong>{stats.miss}</strong>
                <span>미스</span>
              </article>
              <article className="stat-card">
                <strong>{accuracy.toFixed(1)}%</strong>
                <span>정확도</span>
              </article>
            </div>

            <div className="practice-summary-box">
              <div>
                <span className="key-label">진행 시간</span>
                <strong>{(elapsedMs / 1000).toFixed(1)}s</strong>
              </div>
              <div>
                <span className="key-label">남은 시간</span>
                <strong>{remainingSeconds ?? "∞"}</strong>
              </div>
            </div>

            <div className={`practice-judgment-toast${lastJudgment ? ` is-${lastJudgment}` : ""}`}>
              {lastJudgment === "perfect"
                ? "PERFECT"
                : lastJudgment === "good"
                  ? "GOOD"
                  : lastJudgment === "miss"
                    ? "MISS"
                    : "READY"}
            </div>

            {gameState === "ended" && (
              <div className="practice-end-box">
                <h3>연습 종료</h3>
                <p>
                  최대 콤보 <strong>{stats.maxCombo}</strong> · 정확도 <strong>{accuracy.toFixed(1)}%</strong>
                </p>
              </div>
            )}
          </aside>
        </section>
      </section>

      <style jsx>{`
        .practice-panel,
        .practice-rail-panel,
        .practice-stats-panel {
          display: grid;
          gap: 18px;
        }

        .practice-control-header,
        .practice-rail-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .practice-config-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .practice-field {
          display: grid;
          gap: 8px;
        }

        .practice-field span {
          color: var(--muted);
          font-size: 13px;
          font-weight: 700;
        }

        .practice-field-hint {
          color: var(--muted);
          font-size: 11px;
          line-height: 1.45;
        }

        .practice-input,
        .key-value-button,
        .primary-action-button,
        .ghost-action-button {
          border-radius: 14px;
          border: 1px solid var(--line);
          padding: 12px 14px;
          color: var(--text);
          background: rgba(255, 255, 255, 0.04);
        }

        .key-value-button,
        .primary-action-button,
        .ghost-action-button {
          cursor: pointer;
        }

        .key-value-button.is-capturing {
          border-color: rgba(100, 245, 231, 0.8);
          background: rgba(57, 197, 187, 0.14);
        }

        .practice-actions-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .primary-action-button {
          background: linear-gradient(135deg, var(--accent), var(--accent-strong));
          color: #062127;
          border-color: transparent;
          font-weight: 800;
        }

        .ghost-action-button:hover,
        .key-value-button:hover,
        .practice-input:hover {
          border-color: rgba(100, 245, 231, 0.46);
        }

        .practice-play-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
          gap: 14px;
          align-items: start;
        }

        .practice-badge-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .practice-badge {
          border-radius: 999px;
          border: 1px solid var(--line);
          padding: 6px 10px;
          color: var(--accent-strong);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .practice-rail {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          overflow: hidden;
          border-radius: 22px;
          background: linear-gradient(180deg, rgba(7, 19, 26, 0.9), rgba(7, 19, 26, 0.68));
          border: 1px solid rgba(100, 245, 231, 0.16);
          padding: 14px;
        }

        .practice-lane {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .practice-lane.is-active {
          background: linear-gradient(180deg, rgba(57, 197, 187, 0.12), rgba(57, 197, 187, 0.03));
          border-color: rgba(100, 245, 231, 0.24);
        }

        .practice-lane.is-inactive {
          opacity: 0.55;
        }

        .practice-lane-top {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 12px 0;
          font-size: 12px;
          color: var(--muted);
          z-index: 2;
        }

        .practice-key-floor {
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 18px;
          border-radius: 12px;
          border: 1px solid rgba(100, 245, 231, 0.18);
          background: rgba(7, 19, 26, 0.78);
          min-height: 36px;
          display: grid;
          place-items: center;
          color: var(--accent-strong);
          font-weight: 800;
          z-index: 2;
        }

        .practice-note {
          position: absolute;
          left: 6px;
          right: 6px;
          border-radius: 10px;
          background: linear-gradient(180deg, rgba(100, 245, 231, 0.95), rgba(57, 197, 187, 0.92));
          box-shadow: 0 10px 28px rgba(57, 197, 187, 0.2);
        }

        .practice-note.is-perfect,
        .practice-note.is-good {
          opacity: 0;
        }

        .practice-note.is-miss {
          background: linear-gradient(180deg, rgba(255, 122, 144, 0.95), rgba(255, 122, 144, 0.75));
          opacity: 0.45;
        }

        .practice-judgment-line {
          position: absolute;
          left: 14px;
          right: 14px;
          height: 3px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(100, 245, 231, 0.3), rgba(236, 254, 255, 1), rgba(100, 245, 231, 0.3));
          box-shadow: 0 0 30px rgba(236, 254, 255, 0.36);
          z-index: 3;
        }

        .practice-rail-help {
          color: var(--muted);
          line-height: 1.6;
        }

        .practice-summary-box,
        .practice-end-box {
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.03);
          padding: 14px;
          display: grid;
          gap: 10px;
        }

        .practice-summary-box {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .practice-summary-box strong,
        .practice-end-box strong {
          display: block;
          margin-top: 4px;
          font-size: 1.15rem;
        }

        .practice-judgment-toast {
          border-radius: 18px;
          padding: 16px;
          text-align: center;
          font-size: 1.35rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--line);
          color: var(--muted);
        }

        .practice-judgment-toast.is-perfect {
          color: #ffe27a;
          border-color: rgba(255, 226, 122, 0.45);
        }

        .practice-judgment-toast.is-good {
          color: var(--accent-strong);
          border-color: rgba(100, 245, 231, 0.45);
        }

        .practice-judgment-toast.is-miss {
          color: var(--danger);
          border-color: rgba(255, 122, 144, 0.4);
        }

        @media (max-width: 980px) {
          .practice-play-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .practice-config-grid,
          .practice-summary-box {
            grid-template-columns: 1fr;
          }

          .practice-rail {
            gap: 6px;
            padding: 10px;
          }
        }
      `}</style>
    </main>
  );
}
