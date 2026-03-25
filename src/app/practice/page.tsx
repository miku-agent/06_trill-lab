"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GameState = "idle" | "playing" | "paused" | "ended";
type EndMode = "firstMiss" | "timed";
type JudgmentType = "perfect" | "good" | "miss" | null;

interface Note {
  id: number;
  lane: 0 | 1;
  time: number;
  hit: boolean;
  judgment: JudgmentType;
}

interface GameConfig {
  bpm: number;
  subdivision: number;
  speed: number;
  endMode: EndMode;
  duration: number;
  leftKey: string;
  rightKey: string;
}

interface GameStats {
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  totalNotes: number;
}

const DEFAULT_CONFIG: GameConfig = {
  bpm: 120,
  subdivision: 4,
  speed: 5.0,
  endMode: "timed",
  duration: 30,
  leftKey: "a",
  rightKey: "'",
};

const JUDGMENT_WINDOWS = {
  perfect: 50,
  good: 100,
  miss: 150,
};

const LANE_COLORS = ["#39c5bb", "#64f5e7"];

export default function PracticePage() {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState<GameStats>({
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    totalNotes: 0,
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastJudgment, setLastJudgment] = useState<JudgmentType>(null);
  const [keyCapture, setKeyCapture] = useState<"left" | "right" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastNoteTimeRef = useRef<number>(0);
  const nextNoteIdRef = useRef<number>(0);
  const gameTimeRef = useRef<number>(0);

  const resetStats = () => {
    setStats({
      combo: 0,
      maxCombo: 0,
      perfect: 0,
      good: 0,
      miss: 0,
      totalNotes: 0,
    });
    setElapsedTime(0);
    setLastJudgment(null);
  };

  const generateNote = (lane: 0 | 1): Note => {
    const beatDuration = 60000 / config.bpm;
    const noteDuration = beatDuration / config.subdivision;
    const noteTime = lastNoteTimeRef.current + noteDuration;
    lastNoteTimeRef.current = noteTime;

    return {
      id: nextNoteIdRef.current++,
      lane,
      time: noteTime,
      hit: false,
      judgment: null,
    };
  };

  const startGame = () => {
    resetStats();
    setNotes([]);
    setGameState("playing");
    startTimeRef.current = performance.now();
    lastNoteTimeRef.current = 2000; // Start notes 2 seconds in
    nextNoteIdRef.current = 0;
    gameTimeRef.current = 0;

    // Generate initial notes
    const initialNotes: Note[] = [];
    const totalDuration = config.endMode === "timed" ? config.duration * 1000 : 60000;
    let currentLane: 0 | 1 = 0;

    while (lastNoteTimeRef.current < totalDuration) {
      initialNotes.push(generateNote(currentLane));
      currentLane = currentLane === 0 ? 1 : 0;
    }

    setNotes(initialNotes);
    setStats(prev => ({ ...prev, totalNotes: initialNotes.length }));
  };

  const endGame = () => {
    setGameState("ended");
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (keyCapture) {
      e.preventDefault();
      const key = e.key.toLowerCase();
      if (key === "escape") {
        setKeyCapture(null);
        return;
      }

      setConfig(prev => ({
        ...prev,
        [keyCapture === "left" ? "leftKey" : "rightKey"]: key,
      }));
      setKeyCapture(null);
      return;
    }

    if (gameState !== "playing") return;

    const key = e.key.toLowerCase();
    const lane = key === config.leftKey ? 0 : key === config.rightKey ? 1 : -1;

    if (lane === -1) return;

    // Find closest unhit note in the lane
    const currentTime = gameTimeRef.current;
    const laneNotes = notes.filter(n => n.lane === lane && !n.hit);
    let closestNote: Note | null = null;
    let closestDistance = Infinity;

    for (const note of laneNotes) {
      const distance = Math.abs(note.time - currentTime);
      if (distance < closestDistance && distance < JUDGMENT_WINDOWS.miss) {
        closestNote = note;
        closestDistance = distance;
      }
    }

    if (closestNote) {
      let judgment: JudgmentType;
      if (closestDistance <= JUDGMENT_WINDOWS.perfect) {
        judgment = "perfect";
      } else if (closestDistance <= JUDGMENT_WINDOWS.good) {
        judgment = "good";
      } else {
        judgment = "miss";
      }

      closestNote.hit = true;
      closestNote.judgment = judgment;
      setLastJudgment(judgment);

      setStats(prev => {
        const newCombo = judgment === "miss" ? 0 : prev.combo + 1;
        return {
          ...prev,
          combo: newCombo,
          maxCombo: Math.max(newCombo, prev.maxCombo),
          [judgment]: prev[judgment] + 1,
        };
      });

      if (config.endMode === "firstMiss" && judgment === "miss") {
        endGame();
      }

      setTimeout(() => setLastJudgment(null), 300);
    }
  }, [config, gameState, notes, keyCapture]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);

  useEffect(() => {
    if (gameState !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      const now = performance.now();
      const deltaTime = now - startTimeRef.current;
      gameTimeRef.current = deltaTime;
      setElapsedTime(Math.floor(deltaTime / 1000));

      // Check for end conditions
      if (config.endMode === "timed" && deltaTime >= config.duration * 1000) {
        endGame();
        return;
      }

      // Check for missed notes
      const missedNotes = notes.filter(n =>
        !n.hit &&
        deltaTime > n.time + JUDGMENT_WINDOWS.miss
      );

      if (missedNotes.length > 0) {
        missedNotes.forEach(note => {
          note.hit = true;
          note.judgment = "miss";
        });

        setStats(prev => ({
          ...prev,
          combo: 0,
          miss: prev.miss + missedNotes.length,
        }));

        if (config.endMode === "firstMiss") {
          endGame();
          return;
        }
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw lanes
      const laneWidth = canvas.width / 2;
      ctx.fillStyle = "rgba(57, 197, 187, 0.1)";
      ctx.fillRect(0, 0, laneWidth - 1, canvas.height);
      ctx.fillStyle = "rgba(100, 245, 231, 0.1)";
      ctx.fillRect(laneWidth + 1, 0, laneWidth - 1, canvas.height);

      // Draw judgment line
      const judgmentY = canvas.height - 100;
      ctx.strokeStyle = "#ecfeff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, judgmentY);
      ctx.lineTo(canvas.width, judgmentY);
      ctx.stroke();

      // Draw notes
      const fallSpeed = config.speed * 100;
      notes.forEach(note => {
        if (note.hit && note.judgment !== "miss") return;

        const timeDiff = note.time - deltaTime;
        const y = judgmentY - (timeDiff / 1000) * fallSpeed;

        if (y > canvas.height || y < -50) return;

        const x = note.lane === 0 ? laneWidth / 2 : laneWidth + laneWidth / 2;

        ctx.fillStyle = note.hit ? "rgba(255, 122, 144, 0.5)" : LANE_COLORS[note.lane];
        ctx.fillRect(x - 30, y - 15, 60, 30);
      });

      // Draw key indicators
      ctx.font = "16px Arial";
      ctx.fillStyle = "#ecfeff";
      ctx.textAlign = "center";
      ctx.fillText(config.leftKey.toUpperCase(), laneWidth / 2, judgmentY + 40);
      ctx.fillText(config.rightKey.toUpperCase(), laneWidth + laneWidth / 2, judgmentY + 40);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState, config, notes]);

  const accuracy = stats.totalNotes > 0
    ? ((stats.perfect + stats.good) / stats.totalNotes) * 100
    : 0;

  const remainingTime = config.endMode === "timed"
    ? Math.max(0, config.duration - elapsedTime)
    : 0;

  return (
    <main className="page-main">
      <section className="page-section compact-hero">
        <div>
          <p className="eyebrow">PRACTICE MODE</p>
          <h1 className="page-title">연습 모드</h1>
        </div>
      </section>

      <section className="page-section">
        {gameState === "idle" && (
          <div className="practice-config">
            <div className="config-grid">
              <div className="config-item">
                <label className="config-label">BPM</label>
                <input
                  type="number"
                  value={config.bpm}
                  onChange={(e) => setConfig(prev => ({ ...prev, bpm: Number(e.target.value) }))}
                  min="60"
                  max="300"
                  className="config-input"
                />
              </div>

              <div className="config-item">
                <label className="config-label">박자 분할</label>
                <select
                  value={config.subdivision}
                  onChange={(e) => setConfig(prev => ({ ...prev, subdivision: Number(e.target.value) }))}
                  className="config-select"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                  <option value="8">8</option>
                </select>
              </div>

              <div className="config-item">
                <label className="config-label">노트 속도</label>
                <input
                  type="number"
                  value={config.speed}
                  onChange={(e) => setConfig(prev => ({ ...prev, speed: Number(e.target.value) }))}
                  min="0.5"
                  max="10"
                  step="0.5"
                  className="config-input"
                />
              </div>

              <div className="config-item">
                <label className="config-label">종료 모드</label>
                <select
                  value={config.endMode}
                  onChange={(e) => setConfig(prev => ({ ...prev, endMode: e.target.value as EndMode }))}
                  className="config-select"
                >
                  <option value="firstMiss">첫 미스 시 종료</option>
                  <option value="timed">시간 제한</option>
                </select>
              </div>

              {config.endMode === "timed" && (
                <div className="config-item">
                  <label className="config-label">시간 (초)</label>
                  <input
                    type="number"
                    value={config.duration}
                    onChange={(e) => setConfig(prev => ({ ...prev, duration: Number(e.target.value) }))}
                    min="10"
                    max="120"
                    step="10"
                    className="config-input"
                  />
                </div>
              )}

              <div className="config-item">
                <label className="config-label">왼쪽 키</label>
                <button
                  onClick={() => setKeyCapture("left")}
                  className="key-button"
                >
                  {keyCapture === "left" ? "키 입력 중..." : config.leftKey.toUpperCase()}
                </button>
              </div>

              <div className="config-item">
                <label className="config-label">오른쪽 키</label>
                <button
                  onClick={() => setKeyCapture("right")}
                  className="key-button"
                >
                  {keyCapture === "right" ? "키 입력 중..." : config.rightKey.toUpperCase()}
                </button>
              </div>
            </div>

            <button onClick={startGame} className="start-button">
              연습 시작
            </button>
          </div>
        )}

        {(gameState === "playing" || gameState === "ended") && (
          <>
            <div className="game-container">
              <canvas
                ref={canvasRef}
                width={600}
                height={600}
                className="game-canvas"
              />

              <div className="game-stats">
                <div className="stat-item">
                  <span className="stat-label">콤보</span>
                  <span className="stat-value">{stats.combo}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">최대 콤보</span>
                  <span className="stat-value">{stats.maxCombo}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">퍼펙트</span>
                  <span className="stat-value">{stats.perfect}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">굿</span>
                  <span className="stat-value">{stats.good}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">미스</span>
                  <span className="stat-value">{stats.miss}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">정확도</span>
                  <span className="stat-value">{accuracy.toFixed(1)}%</span>
                </div>
                {config.endMode === "timed" && (
                  <div className="stat-item">
                    <span className="stat-label">남은 시간</span>
                    <span className="stat-value">{remainingTime}초</span>
                  </div>
                )}
              </div>

              {lastJudgment && (
                <div className={`judgment-display judgment-${lastJudgment}`}>
                  {lastJudgment === "perfect" ? "퍼펙트!" :
                   lastJudgment === "good" ? "굿!" : "미스"}
                </div>
              )}
            </div>

            {gameState === "ended" && (
              <div className="game-over">
                <h2 className="game-over-title">연습 종료!</h2>
                <div className="final-stats">
                  <p>최종 콤보: {stats.maxCombo}</p>
                  <p>정확도: {accuracy.toFixed(1)}%</p>
                  <p>퍼펙트: {stats.perfect} / 굿: {stats.good} / 미스: {stats.miss}</p>
                </div>
                <button onClick={() => setGameState("idle")} className="restart-button">
                  다시 시작
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <style jsx>{`
        .practice-config {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 32px;
          max-width: 800px;
          margin: 0 auto;
        }

        .config-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 24px;
          margin-bottom: 32px;
        }

        .config-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .config-label {
          font-size: 14px;
          color: var(--muted);
        }

        .config-input,
        .config-select {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--line);
          border-radius: 8px;
          color: var(--text);
          font-size: 16px;
        }

        .key-button {
          padding: 8px 12px;
          background: rgba(57, 197, 187, 0.1);
          border: 1px solid var(--accent);
          border-radius: 8px;
          color: var(--text);
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .key-button:hover {
          background: rgba(57, 197, 187, 0.2);
        }

        .start-button {
          width: 100%;
          padding: 16px;
          background: var(--accent);
          border: none;
          border-radius: 8px;
          color: var(--bg);
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .start-button:hover {
          background: var(--accent-strong);
        }

        .game-container {
          position: relative;
          max-width: 800px;
          margin: 0 auto;
        }

        .game-canvas {
          width: 100%;
          background: rgba(10, 23, 31, 0.95);
          border: 1px solid var(--line);
          border-radius: 12px;
        }

        .game-stats {
          display: flex;
          justify-content: space-around;
          padding: 16px;
          margin-top: 16px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 12px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: var(--muted);
        }

        .stat-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--text);
        }

        .judgment-display {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 48px;
          font-weight: 700;
          animation: judgment-pop 0.3s ease-out;
          pointer-events: none;
        }

        .judgment-perfect {
          color: #ffd700;
        }

        .judgment-good {
          color: var(--accent-strong);
        }

        .judgment-miss {
          color: var(--danger);
        }

        @keyframes judgment-pop {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.8;
          }
        }

        .game-over {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--panel-strong);
          border: 1px solid var(--accent);
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          min-width: 300px;
        }

        .game-over-title {
          font-size: 32px;
          color: var(--accent-strong);
          margin-bottom: 16px;
        }

        .final-stats {
          margin-bottom: 24px;
        }

        .final-stats p {
          margin: 8px 0;
          color: var(--text);
        }

        .restart-button {
          padding: 12px 24px;
          background: var(--accent);
          border: none;
          border-radius: 8px;
          color: var(--bg);
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }

        .restart-button:hover {
          background: var(--accent-strong);
        }
      `}</style>
    </main>
  );
}