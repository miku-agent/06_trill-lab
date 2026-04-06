"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { getPatternDefinition, type PatternKey } from "@/app/lib/patterns";
import {
  getDefaultDrurukVariant,
  getDrurukKeyLabels,
  getDrurukLaneIndexes,
  getDrurukProfile,
  type DrurukKeyCount,
  type DrurukDirection,
} from "@/app/lib/druruk";

type GameState = "idle" | "playing" | "ended";
type EndMode = "firstMiss" | "timed";
type JudgmentType = "perfect" | "good" | "miss";
type PracticePattern = Extract<PatternKey, "trill" | "druruk">;
type NoteSubdivision = 1 | 2 | 4 | 8 | 16 | 32;

type Note = {
  id: number;
  lane: number;
  time: number;
  judged: boolean;
  judgment: JudgmentType | null;
};

type BeatGuideLine = {
  id: number;
  time: number;
  isMeasure: boolean;
};

type HitEffect = {
  id: number;
  lane: number;
};

type LanePressEffect = {
  lane: number;
  activatedAt: number;
};

type LaneJudgmentFeedback = {
  id: number;
  lane: number;
  judgment: JudgmentType;
  signedMs: string;
  timingLabel: "FAST" | "SLOW";
};

type TimingPoint = {
  id: number;
  deltaMs: number;
  judgment: JudgmentType;
};

type PracticeTestApi = {
  startControlledGame: (partialConfig?: Partial<GameConfig>) => void;
  setElapsedMs: (nextElapsedMs: number) => void;
  getPendingNotes: () => Array<Pick<Note, "id" | "lane" | "time">>;
  focus: () => void;
};

type GameConfig = {
  pattern: PracticePattern;
  bpm: number;
  subdivision: NoteSubdivision;
  speed: number;
  endMode: EndMode;
  duration: number;
  keyBindings: string[];
  direction: DrurukDirection;
  drurukKeyCount: DrurukKeyCount;
};

type GameStats = {
  combo: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  totalNotes: number;
};

type PatternSpec = {
  key: PracticePattern;
  title: string;
  heroTitle: string;
  statusLabel: string;
  configTitle: string;
  railTitle: string;
  railBadges: (config: GameConfig) => string[];
  laneCount: number;
  activeLaneIndexes: (config: GameConfig) => number[];
  defaultBindings: (config: GameConfig) => string[];
  sequenceFor: (config: GameConfig) => number[];
  laneLabel: (lane: number, config: GameConfig) => string;
};

const LEAD_IN_MS = 1800;
const FIRST_MISS_BUFFER_MS = 5000;
const PERFECT_WINDOW_MS = 45;
const GOOD_WINDOW_MS = 95;
const MISS_WINDOW_MS = 150;
const NOTE_HEIGHT_PX = 20;
const RAIL_HEIGHT_PX = 520;
const NOTE_SPAWN_Y = 24;
const JUDGMENT_LINE_Y = 430;
const HIT_EFFECT_DURATION_MS = 260;
const LANE_PRESS_EFFECT_DURATION_MS = 120;
const LANE_FEEDBACK_DURATION_MS = 720;
const MIN_TRAVEL_MS = 260;
const MAX_TRAVEL_MS = 1050;

const DEFAULT_CONFIG: GameConfig = {
  pattern: "trill",
  bpm: 150,
  subdivision: 4,
  speed: 7.5,
  endMode: "timed",
  duration: 30,
  keyBindings: ["a", "'"],
  direction: "forward",
  drurukKeyCount: 6,
};

const PRACTICE_PATTERN_KEYS: PracticePattern[] = ["trill", "druruk"];
const TRILL_ACTIVE_LANES = [1, 2];
const PRACTICE_PATTERN_SPECS: Record<PracticePattern, PatternSpec> = {
  trill: {
    key: "trill",
    title: "트릴",
    heroTitle: "연습 모드",
    statusLabel: "TRILL PRACTICE",
    configTitle: "트릴 연습 세팅",
    railTitle: "4레인 트릴 레일",
    railBadges: (config) => ["ACTIVE: 2 / 4 레인", "NOTE WIDTH: FULL", `BEAT LINE: 1/4 · 비트 ${config.subdivision}`],
    laneCount: 4,
    activeLaneIndexes: () => TRILL_ACTIVE_LANES,
    defaultBindings: () => ["a", "'"],
    sequenceFor: () => TRILL_ACTIVE_LANES,
    laneLabel: (lane) => `LANE ${lane + 1}`,
  },
  druruk: {
    key: "druruk",
    title: "드르륵",
    heroTitle: "연습 모드",
    statusLabel: "DRURUK",
    configTitle: "드르륵 세팅",
    railTitle: "드르륵 레일",
    railBadges: (config) => {
      const profile = getDrurukProfile(getDefaultDrurukVariant(config.drurukKeyCount === 4 ? 4 : 6));
      const directionLabel = config.direction === "forward"
        ? profile.keyCount === 4 ? "1→2→3→4" : "1→2→3→4→5→6"
        : profile.keyCount === 4 ? "4→3→2→1" : "6→5→4→3→2→1";
      return [
        `ACTIVE: ${config.drurukKeyCount} / ${config.drurukKeyCount} 레인`,
        `DIR: ${directionLabel}`,
        `BEAT LINE: 1/4 · 비트 ${config.subdivision}`,
      ];
    },
    laneCount: 6,
    activeLaneIndexes: (config) => getDrurukLaneIndexes(config.drurukKeyCount, "forward"),
    defaultBindings: (config) => getDrurukProfile(getDefaultDrurukVariant(config.drurukKeyCount)).defaultKeys.map((key) => key.toLowerCase()),
    sequenceFor: (config) => getDrurukLaneIndexes(config.drurukKeyCount, config.direction),
    laneLabel: (lane, config) => getDrurukKeyLabels(config.drurukKeyCount)[lane] ?? `${lane + 1}번`,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBindingFromKeyboardEvent(event: KeyboardEvent) {
  const { code, key } = event;

  if (code === "Space") return " ";
  if (code === "Quote") return "'";
  if (code === "Semicolon") return ";";
  if (code === "Comma") return ",";
  if (code === "Period") return ".";
  if (code === "Slash") return "/";
  if (code === "Backquote") return "`";
  if (code === "BracketLeft") return "[";
  if (code === "BracketRight") return "]";
  if (code === "Backslash") return "\\";
  if (code === "Minus") return "-";
  if (code === "Equal") return "=";

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }

  return key.length === 1 ? key.toLowerCase() : key;
}

function matchesBinding(event: KeyboardEvent, binding: string) {
  const normalizedBinding = binding.toLowerCase();
  const normalizedKey = event.key.toLowerCase();
  const normalizedFromCode = normalizeBindingFromKeyboardEvent(event).toLowerCase();

  return normalizedKey === normalizedBinding || normalizedFromCode === normalizedBinding;
}

function formatKeyLabel(key: string) {
  if (key === " ") return "SPACE";
  return key.length === 1 ? key.toUpperCase() : key.toUpperCase();
}

function formatSignedMs(deltaMs: number) {
  const rounded = Math.round(deltaMs);
  return `${rounded >= 0 ? "+" : ""}${rounded}ms`;
}

function getTimelineTotalMs(config: GameConfig) {
  const beatMs = 60000 / config.bpm;
  const intervalMs = beatMs / config.subdivision;

  return config.endMode === "timed" ? config.duration * 1000 + LEAD_IN_MS + intervalMs * 2 : 60000;
}

function getTimelineCenterY(noteTime: number, elapsedMs: number, travelMs: number) {
  return JUDGMENT_LINE_Y - ((noteTime - elapsedMs) / travelMs) * (JUDGMENT_LINE_Y - NOTE_SPAWN_Y);
}

function createNotes(config: GameConfig): Note[] {
  const spec = PRACTICE_PATTERN_SPECS[config.pattern];
  const beatMs = 60000 / config.bpm;
  const intervalMs = beatMs / config.subdivision;
  const totalMs = getTimelineTotalMs(config);
  const sequence = spec.sequenceFor(config);

  const notes: Note[] = [];
  let cursor = 0;
  let currentTime = LEAD_IN_MS;
  let id = 0;

  while (currentTime <= totalMs) {
    notes.push({
      id,
      lane: sequence[cursor % sequence.length],
      time: currentTime,
      judged: false,
      judgment: null,
    });

    id += 1;
    cursor += 1;
    currentTime += intervalMs;
  }

  return notes;
}

function getTravelMs(speed: number) {
  const normalized = clamp(speed, 0, 10) / 10;
  const eased = Math.pow(normalized, 0.78);
  return Math.round(clamp(MAX_TRAVEL_MS - eased * (MAX_TRAVEL_MS - MIN_TRAVEL_MS), MIN_TRAVEL_MS, MAX_TRAVEL_MS));
}

function createBeatGuideLines(config: GameConfig): BeatGuideLine[] {
  const beatMs = 60000 / config.bpm;
  const totalMs = getTimelineTotalMs(config);
  const lines: BeatGuideLine[] = [];

  let currentTime = LEAD_IN_MS;
  let id = 0;

  while (currentTime <= totalMs) {
    lines.push({
      id,
      time: currentTime,
      isMeasure: id % 4 === 0,
    });

    id += 1;
    currentTime += beatMs;
  }

  return lines;
}

function getAccuracy(stats: GameStats) {
  if (stats.totalNotes === 0) return 0;
  return ((stats.perfect + stats.good) / stats.totalNotes) * 100;
}

function getInitialConfig(pattern: PracticePattern): GameConfig {
  return {
    ...DEFAULT_CONFIG,
    pattern,
    keyBindings: PRACTICE_PATTERN_SPECS[pattern].defaultBindings(DEFAULT_CONFIG),
    direction: "forward",
    drurukKeyCount: 6,
  };
}

function getPlayablePattern(input: string | null | undefined): PracticePattern {
  const pattern = getPatternDefinition(input).key;
  return pattern === "druruk" ? "druruk" : "trill";
}

export default function PracticePage() {
  return (
    <Suspense fallback={<main className="page-main" />}>
      <PracticePageRouter />
    </Suspense>
  );
}

function PracticePageRouter() {
  const searchParams = useSearchParams();
  const pattern = getPlayablePattern(searchParams.get("pattern"));
  return <PracticePageContent key={pattern} />;
}

function PracticePageContent() {
  const searchParams = useSearchParams();
  const testMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("testMode") === "true";
  const pattern = getPlayablePattern(searchParams.get("pattern"));
  const spec = PRACTICE_PATTERN_SPECS[pattern];

  const [config, setConfig] = useState<GameConfig>(() => getInitialConfig(pattern));
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
  const [keyCaptureTarget, setKeyCaptureTarget] = useState<number | null>(null);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [lanePressEffects, setLanePressEffects] = useState<LanePressEffect[]>([]);
  const [laneJudgmentFeedbacks, setLaneJudgmentFeedbacks] = useState<LaneJudgmentFeedback[]>([]);

  const rootRef = useRef<HTMLElement | null>(null);
  const startAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const notesRef = useRef<Note[]>([]);
  const hitEffectIdRef = useRef(0);
  const laneFeedbackIdRef = useRef(0);
  const controlledElapsedMsRef = useRef<number | null>(null);
  const timingHistoryRef = useRef<TimingPoint[]>([]);
  const timerIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const [timingHistory, setTimingHistory] = useState<TimingPoint[]>([]);

  const safeSetTimeout = useCallback((cb: () => void, delay: number) => {
    const id = setTimeout(() => {
      timerIdsRef.current.delete(id);
      cb();
    }, delay);
    timerIdsRef.current.add(id);
    return id;
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);


  const travelMs = useMemo(() => getTravelMs(config.speed), [config.speed]);
  const beatGuideLines = useMemo(() => createBeatGuideLines(config), [config]);
  const sequence = useMemo(() => spec.sequenceFor(config), [config, spec]);
  const activeLanes = useMemo(() => spec.activeLaneIndexes(config), [config, spec]);
  const laneIndexes = useMemo(() => Array.from({ length: spec.laneCount }, (_, index) => index), [spec.laneCount]);
  const nextExpectedNote = useMemo(() => notes.find((note) => !note.judged) ?? null, [notes]);
  const nextExpectedLane = nextExpectedNote?.lane ?? sequence[0] ?? 0;

  const spawnHitEffect = useCallback((lane: number) => {
    const id = hitEffectIdRef.current++;
    setHitEffects((prev) => [...prev, { id, lane }]);

    safeSetTimeout(() => {
      setHitEffects((prev) => prev.filter((effect) => effect.id !== id));
    }, HIT_EFFECT_DURATION_MS);
  }, [safeSetTimeout]);

  const triggerLanePressEffect = useCallback((lane: number) => {
    const activatedAt = performance.now();
    setLanePressEffects((prev) => [...prev.filter((effect) => effect.lane !== lane), { lane, activatedAt }]);

    safeSetTimeout(() => {
      setLanePressEffects((prev) => prev.filter((effect) => !(effect.lane === lane && effect.activatedAt === activatedAt)));
    }, LANE_PRESS_EFFECT_DURATION_MS);
  }, [safeSetTimeout]);

  const spawnLaneJudgmentFeedback = useCallback((lane: number, judgment: JudgmentType, deltaMs: number) => {
    const id = laneFeedbackIdRef.current++;
    const signedMs = formatSignedMs(deltaMs);
    const timingLabel: "FAST" | "SLOW" = deltaMs < 0 ? "FAST" : "SLOW";

    setLaneJudgmentFeedbacks((prev) => [...prev.filter((feedback) => feedback.lane !== lane), { id, lane, judgment, signedMs, timingLabel }]);

    const point: TimingPoint = { id, deltaMs, judgment };
    timingHistoryRef.current.push(point);
    if (timingHistoryRef.current.length > 500) {
      timingHistoryRef.current = timingHistoryRef.current.slice(-500);
    }
    setTimingHistory([...timingHistoryRef.current]);

    safeSetTimeout(() => {
      setLaneJudgmentFeedbacks((prev) => prev.filter((feedback) => feedback.id !== id));
    }, LANE_FEEDBACK_DURATION_MS);
  }, [safeSetTimeout]);

  const finishGame = useCallback(() => {
    stopLoop();
    setGameState("ended");
  }, [stopLoop]);

  const applyJudgment = useCallback((noteId: number, judgment: JudgmentType, lane: number) => {
    const noteIndex = notesRef.current.findIndex((note) => note.id === noteId && !note.judged);
    if (noteIndex < 0) return false;

    const nextNotes = notesRef.current.map((note, index) =>
      index === noteIndex
        ? {
            ...note,
            judged: true,
            judgment,
          }
        : note,
    );

    notesRef.current = nextNotes;
    setNotes(nextNotes);

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

    if (judgment === "perfect") {
      spawnHitEffect(lane);
    }

    return true;
  }, [spawnHitEffect]);

  const focusPracticeRoot = useCallback(() => {
    rootRef.current?.focus();
  }, []);

  const handleRootMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest("button, input, select, textarea, a, label")) {
      return;
    }

    focusPracticeRoot();
  }, [focusPracticeRoot]);

  const getCurrentElapsedMs = useCallback(() => {
    if (controlledElapsedMsRef.current !== null) {
      return controlledElapsedMsRef.current;
    }

    return performance.now() - startAtRef.current;
  }, []);

  const syncElapsedForTest = useCallback((nextElapsedMs: number) => {
    controlledElapsedMsRef.current = nextElapsedMs;
    setElapsedMs(nextElapsedMs);

    const staleMisses = notesRef.current.filter((note) => !note.judged && nextElapsedMs - note.time > MISS_WINDOW_MS);

    if (staleMisses.length > 0) {
      staleMisses.forEach((note) => {
        applyJudgment(note.id, "miss", note.lane);
        const point: TimingPoint = { id: note.id, deltaMs: MISS_WINDOW_MS, judgment: "miss" };
        timingHistoryRef.current.push(point);
      });
      if (timingHistoryRef.current.length > 500) {
        timingHistoryRef.current = timingHistoryRef.current.slice(-500);
      }
      setTimingHistory([...timingHistoryRef.current]);
    }
  }, [applyJudgment]);

  const startGame = useCallback(() => {
    const nextNotes = createNotes(config);
    notesRef.current = nextNotes;
    setNotes(nextNotes);
    setStats({ combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, totalNotes: nextNotes.length });
    setElapsedMs(0);

    setHitEffects([]);
    setLanePressEffects([]);
    setLaneJudgmentFeedbacks([]);
    timingHistoryRef.current = [];
    setTimingHistory([]);
    setGameState("playing");
    controlledElapsedMsRef.current = null;
    startAtRef.current = performance.now();
    safeSetTimeout(() => focusPracticeRoot(), 0);
  }, [config, focusPracticeRoot, safeSetTimeout]);

  const resetToIdle = useCallback(() => {
    stopLoop();
    notesRef.current = [];
    setElapsedMs(0);
    setNotes([]);

    setHitEffects([]);
    setLanePressEffects([]);
    setLaneJudgmentFeedbacks([]);
    timingHistoryRef.current = [];
    setTimingHistory([]);
    setStats({ combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, totalNotes: 0 });
    controlledElapsedMsRef.current = null;
    setGameState("idle");
  }, [stopLoop]);

  useEffect(() => {
    if (gameState !== "playing") {
      stopLoop();
      return;
    }

    if (controlledElapsedMsRef.current !== null) {
      stopLoop();
      return;
    }

    const tick = () => {
      const now = performance.now();
      const elapsed = now - startAtRef.current;
      setElapsedMs(elapsed);

      const staleMisses = notesRef.current.filter((note) => !note.judged && elapsed - note.time > MISS_WINDOW_MS);

      if (staleMisses.length > 0) {
        staleMisses.forEach((note) => {
          applyJudgment(note.id, "miss", note.lane);
          const point: TimingPoint = { id: note.id, deltaMs: MISS_WINDOW_MS, judgment: "miss" };
          timingHistoryRef.current.push(point);
        });
        if (timingHistoryRef.current.length > 500) {
          timingHistoryRef.current = timingHistoryRef.current.slice(-500);
        }
        setTimingHistory([...timingHistoryRef.current]);

        if (config.endMode === "firstMiss") {
          finishGame();
          return;
        }
      }

      if (config.endMode === "timed" && elapsed >= config.duration * 1000 + LEAD_IN_MS) {
        finishGame();
        return;
      }

      if (config.endMode === "firstMiss" && elapsed > LEAD_IN_MS + FIRST_MISS_BUFFER_MS && notesRef.current.every((note) => note.judged)) {
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
      if (keyCaptureTarget !== null) {
        event.preventDefault();
        if (event.key.toLowerCase() === "escape") {
          setKeyCaptureTarget(null);
          return;
        }

        const normalizedBinding = normalizeBindingFromKeyboardEvent(event);
        setConfig((prev) => ({
          ...prev,
          keyBindings: prev.keyBindings.map((binding, index) => (index === keyCaptureTarget ? normalizedBinding : binding)),
        }));
        setKeyCaptureTarget(null);
        return;
      }

      if (gameState !== "playing") return;

      const pressedKeyIndex = config.keyBindings.findIndex((binding) => matchesBinding(event, binding));
      if (pressedKeyIndex < 0) return;
      const pressedLane = activeLanes[pressedKeyIndex] ?? pressedKeyIndex;

      event.preventDefault();
      triggerLanePressEffect(pressedLane);

      const target = notesRef.current.find((note) => !note.judged);
      if (!target) return;

      if (pressedLane !== target.lane) return;

      const currentTime = getCurrentElapsedMs();
      const delta = currentTime - target.time;

      if (delta < -MISS_WINDOW_MS) return;

      if (delta > MISS_WINDOW_MS) return;

      const distance = Math.abs(delta);
      const judgment: JudgmentType = distance <= PERFECT_WINDOW_MS ? "perfect" : distance <= GOOD_WINDOW_MS ? "good" : "miss";
      const applied = applyJudgment(target.id, judgment, target.lane);
      if (!applied) return;

      spawnLaneJudgmentFeedback(target.lane, judgment, delta);

      if (config.endMode === "firstMiss" && judgment === "miss") {
        finishGame();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeLanes, applyJudgment, config.endMode, config.keyBindings, finishGame, gameState, getCurrentElapsedMs, keyCaptureTarget, spawnLaneJudgmentFeedback, triggerLanePressEffect]);

  useEffect(() => {
    const timers = timerIdsRef.current;
    return () => {
      stopLoop();
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, [stopLoop]);

  const injectTestFeedback = useCallback((feedbacks: LaneJudgmentFeedback[]) => {
    if (testMode) {
      setLaneJudgmentFeedbacks(feedbacks);
    }
  }, [testMode]);

  useEffect(() => {
    if (!testMode) {
      return;
    }

    const win = window as Window & {
      __injectTestFeedback?: typeof injectTestFeedback;
      __practiceTestApi?: PracticeTestApi;
    };

    win.__injectTestFeedback = injectTestFeedback;
    win.__practiceTestApi = {
      startControlledGame: (partialConfig = {}) => {
        const nextConfig = { ...config, ...partialConfig };
        const nextNotes = createNotes(nextConfig);

        controlledElapsedMsRef.current = 0;
        notesRef.current = nextNotes;
        setConfig(nextConfig);
        setNotes(nextNotes);
        setStats({ combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, totalNotes: nextNotes.length });
        setElapsedMs(0);
    
        setHitEffects([]);
        setLanePressEffects([]);
        setLaneJudgmentFeedbacks([]);
        setGameState("playing");
        safeSetTimeout(() => focusPracticeRoot(), 0);
      },
      setElapsedMs: (nextElapsedMs) => {
        syncElapsedForTest(nextElapsedMs);
      },
      getPendingNotes: () => notesRef.current.filter((note) => !note.judged).map(({ id, lane, time }) => ({ id, lane, time })),
      focus: () => {
        focusPracticeRoot();
      },
    };

    return () => {
      delete win.__injectTestFeedback;
      delete win.__practiceTestApi;
    };
  }, [config, focusPracticeRoot, injectTestFeedback, safeSetTimeout, syncElapsedForTest, testMode]);

  const accuracy = getAccuracy(stats);
  const judgedNotes = stats.perfect + stats.good + stats.miss;
  const remainingSeconds = config.endMode === "timed" ? Math.max(0, Math.ceil((config.duration * 1000 + LEAD_IN_MS - elapsedMs) / 1000)) : null;
  const leadInRemaining = Math.max(0, Math.ceil((LEAD_IN_MS - elapsedMs) / 1000));
  const hasDuplicateBindings = new Set(config.keyBindings).size !== config.keyBindings.length;

  return (
    <main className="page-main" ref={rootRef} tabIndex={-1} onMouseDown={handleRootMouseDown}>
      <section className="page-section compact-hero">
        <div>
          <p className="eyebrow">PRACTICE MODE</p>
          <h1 className="page-title">{spec.heroTitle}</h1>
        </div>
        <div className="status-pill">{spec.statusLabel}</div>
      </section>

      <section className="page-section stack-gap-lg">
        <div className="practice-pattern-tabs" aria-label="연습 패턴 선택">
          {PRACTICE_PATTERN_KEYS.map((item) => {
            const definition = getPatternDefinition(item);
            const isActive = item === pattern;
            return (
              <Link key={item} href={`/practice?pattern=${item}`} className={`practice-pattern-tab${isActive ? " is-active" : ""}`}>
                {definition.shortLabel}
              </Link>
            );
          })}
        </div>

        <article className="panel practice-panel">
          <div className="practice-control-header">
            <div>
              <p className="section-label">설정</p>
              <h2 className="section-title">{spec.configTitle}</h2>
            </div>
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
                onChange={(event) => setConfig((prev) => ({ ...prev, bpm: clamp(Number(event.target.value) || 60, 60, 320) }))}
                disabled={gameState === "playing"}
              />
            </label>

            <label className="practice-field">
              <span>비트</span>
              <select
                className="practice-input"
                value={config.subdivision}
                onChange={(event) => setConfig((prev) => ({ ...prev, subdivision: Number(event.target.value) as NoteSubdivision }))}
                disabled={gameState === "playing"}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={8}>8</option>
                <option value={16}>16</option>
                <option value={32}>32</option>
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
                onChange={(event) => setConfig((prev) => ({ ...prev, speed: clamp(Number(event.target.value) || 0, 0, 10) }))}
                disabled={gameState === "playing"}
              />
            </label>

            <label className="practice-field">
              <span>종료 모드</span>
              <select
                className="practice-input"
                value={config.endMode}
                onChange={(event) => setConfig((prev) => ({ ...prev, endMode: event.target.value as EndMode }))}
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
                onChange={(event) => setConfig((prev) => ({ ...prev, duration: clamp(Number(event.target.value) || 10, 10, 180) }))}
                disabled={gameState !== "idle" || config.endMode !== "timed"}
              />
            </label>

            {pattern === "druruk" ? (
              <>
                <label className="practice-field">
                  <span>키 수</span>
                  <select
                    className="practice-input"
                    value={config.drurukKeyCount}
                    onChange={(event) => {
                      const nextCount = Number(event.target.value) as DrurukKeyCount;
                      const nextBindings = getDrurukProfile(getDefaultDrurukVariant(nextCount)).defaultKeys.map((key) => key.toLowerCase());
                      setConfig((prev) => ({ ...prev, drurukKeyCount: nextCount, keyBindings: nextBindings, direction: "forward" }));
                    }}
                    disabled={gameState === "playing"}
                  >
                    <option value={4}>4키</option>
                    <option value={6}>6키</option>
                  </select>
                </label>
                <label className="practice-field">
                  <span>진행 방향</span>
                  <select
                    className="practice-input"
                    value={config.direction}
                    onChange={(event) => setConfig((prev) => ({ ...prev, direction: event.target.value as DrurukDirection }))}
                    disabled={gameState === "playing"}
                  >
                    <option value="forward">{config.drurukKeyCount === 4 ? "1 → 2 → 3 → 4" : "1 → 2 → 3 → 4 → 5 → 6"}</option>
                    <option value="reverse">{config.drurukKeyCount === 4 ? "4 → 3 → 2 → 1" : "6 → 5 → 4 → 3 → 2 → 1"}</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>

          <div className="practice-key-grid">
            {config.keyBindings.slice(0, pattern === "druruk" ? config.drurukKeyCount : config.keyBindings.length).map((binding, index) => (
              <div key={`${pattern}-binding-${index}`} className="practice-field">
                <span>{spec.laneLabel(activeLanes[index] ?? index, config)} 키</span>
                <button
                  type="button"
                  className={`key-value-button${keyCaptureTarget === index ? " is-capturing" : ""}`}
                  onClick={() => setKeyCaptureTarget(index)}
                  disabled={gameState === "playing"}
                >
                  {keyCaptureTarget === index ? "키 입력 중... (ESC 취소)" : formatKeyLabel(binding)}
                </button>
              </div>
            ))}
          </div>

          {hasDuplicateBindings ? <p className="inline-note is-danger">같은 키를 중복 바인딩하면 입력 레인이 충돌할 수 있어요.</p> : null}

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
                <h2 className="section-title">{spec.railTitle}</h2>
              </div>
              <div className="practice-badge-row">
                {spec.railBadges(config).map((badge) => (
                  <span key={badge} className="practice-badge">{badge}</span>
                ))}
              </div>
            </div>

            <div className={`practice-rail${pattern === "druruk" && config.drurukKeyCount === 6 ? " is-six" : ""}`} style={{ height: `${RAIL_HEIGHT_PX}px` }}>
              {beatGuideLines.map((line) => {
                const y = getTimelineCenterY(line.time, elapsedMs, travelMs);
                if (y < -4 || y > RAIL_HEIGHT_PX) return null;

                return <div key={line.id} className={`practice-beat-line${line.isMeasure ? " is-measure" : ""}`} style={{ top: `${y}px` }} />;
              })}

              {laneIndexes.map((lane) => {
                const laneNotes = notes.filter((note) => note.lane === lane);
                const keyIndex = activeLanes.indexOf(lane);
                const laneKey = keyIndex >= 0 ? (config.keyBindings[keyIndex] ?? null) : null;
                const isActiveLane = activeLanes.includes(lane);

                return (
                  <div key={lane} className={`practice-lane${isActiveLane ? " is-active" : " is-inactive"}${nextExpectedLane === lane && gameState === "playing" ? " is-next" : ""}`}>
                    <div className="practice-lane-top">
                      <span>{spec.laneLabel(lane, config)}</span>
                      <strong>{laneKey ? formatKeyLabel(laneKey) : "-"}</strong>
                    </div>

                    {lanePressEffects.some((effect) => effect.lane === lane) ? <div className="practice-lane-press-effect" /> : null}

                    <div className="practice-lane-feedback-anchor" style={{ top: `${JUDGMENT_LINE_Y}px` }} aria-hidden="true">
                      {laneJudgmentFeedbacks
                        .filter((feedback) => feedback.lane === lane)
                        .map((feedback) => (
                          <div key={feedback.id} className={`practice-lane-feedback is-${feedback.judgment}`} data-lane={lane} aria-live="off">
                            <strong>{feedback.judgment.toUpperCase()}</strong>
                            <span>{feedback.signedMs}</span>
                            <small>{feedback.timingLabel}</small>
                          </div>
                        ))}
                    </div>

                    {laneNotes.map((note) => {
                      const y = getTimelineCenterY(note.time, elapsedMs, travelMs) - NOTE_HEIGHT_PX / 2;
                      if (y < -NOTE_HEIGHT_PX || y > RAIL_HEIGHT_PX) return null;

                      return <div key={note.id} className={`practice-note${note.judged ? ` is-${note.judgment}` : ""}`} style={{ top: `${y}px`, height: `${NOTE_HEIGHT_PX}px` }} />;
                    })}

                    {hitEffects.filter((effect) => effect.lane === lane).map((effect) => (
                      <div key={effect.id} className="practice-hit-effect">
                        <span className="practice-hit-spark practice-hit-spark-center" />
                        <span className="practice-hit-spark practice-hit-spark-left" />
                        <span className="practice-hit-spark practice-hit-spark-right" />
                      </div>
                    ))}

                    <div className="practice-key-floor">{laneKey ? formatKeyLabel(laneKey) : ""}</div>
                  </div>
                );
              })}

              <div className="practice-judgment-line" style={{ top: `${JUDGMENT_LINE_Y}px` }} />
            </div>

            {gameState === "playing" && leadInRemaining > 0 ? (
              <div className="practice-rail-help">
                <span>시작 준비... {leadInRemaining}</span>
              </div>
            ) : null}
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

            <div className="practice-judgment-number-grid">
              <article className="practice-judgment-number-card is-perfect">
                <span>PERFECT</span>
                <strong>{stats.perfect}</strong>
              </article>
              <article className="practice-judgment-number-card is-good">
                <span>GOOD</span>
                <strong>{stats.good}</strong>
              </article>
              <article className="practice-judgment-number-card is-miss">
                <span>MISS</span>
                <strong>{stats.miss}</strong>
              </article>
              <article className="practice-judgment-number-card is-total">
                <span>JUDGED / TOTAL</span>
                <strong>{judgedNotes} / {stats.totalNotes}</strong>
              </article>
            </div>

          </aside>
        </section>

        {gameState !== "idle" ? (
          <article className="panel practice-timing-graph-card">
            <div>
              <p className="section-label">TIMING DEVIATION</p>
              <h2 className="section-title">타이밍 편차 그래프</h2>
            </div>
            <div className="practice-timing-graph-wrap">
              <svg viewBox={`0 0 800 200`} preserveAspectRatio="none" className="practice-timing-svg">
                <rect x="0" y={200 / 2 - (GOOD_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} width="800" height={(GOOD_WINDOW_MS / MISS_WINDOW_MS) * 200} fill="rgba(57, 197, 187, 0.06)" />
                <rect x="0" y={200 / 2 - (PERFECT_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} width="800" height={(PERFECT_WINDOW_MS / MISS_WINDOW_MS) * 200} fill="rgba(255, 226, 122, 0.08)" />
                <line x1="0" y1="100" x2="800" y2="100" stroke="rgba(236, 254, 255, 0.25)" strokeWidth="1" strokeDasharray="6 4" />
                <line x1="0" y1={200 / 2 - (PERFECT_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} x2="800" y2={200 / 2 - (PERFECT_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} stroke="rgba(255, 226, 122, 0.2)" strokeWidth="0.5" />
                <line x1="0" y1={200 / 2 + (PERFECT_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} x2="800" y2={200 / 2 + (PERFECT_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} stroke="rgba(255, 226, 122, 0.2)" strokeWidth="0.5" />
                <line x1="0" y1={200 / 2 - (GOOD_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} x2="800" y2={200 / 2 - (GOOD_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} stroke="rgba(57, 197, 187, 0.2)" strokeWidth="0.5" />
                <line x1="0" y1={200 / 2 + (GOOD_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} x2="800" y2={200 / 2 + (GOOD_WINDOW_MS / MISS_WINDOW_MS) * (200 / 2)} stroke="rgba(57, 197, 187, 0.2)" strokeWidth="0.5" />
                {timingHistory.length > 1 ? (
                  <polyline
                    fill="none"
                    stroke="rgba(236, 254, 255, 0.15)"
                    strokeWidth="1"
                    points={timingHistory.map((point, index) => {
                      const x = (index / Math.max(timingHistory.length - 1, 1)) * 800;
                      const y = 100 + (point.deltaMs / MISS_WINDOW_MS) * 100;
                      return `${x},${Math.max(0, Math.min(200, y))}`;
                    }).join(" ")}
                  />
                ) : null}
                {timingHistory.map((point, index) => {
                  const x = timingHistory.length === 1 ? 400 : (index / (timingHistory.length - 1)) * 800;
                  const y = 100 + (point.deltaMs / MISS_WINDOW_MS) * 100;
                  const clampedY = Math.max(4, Math.min(196, y));
                  const color = point.judgment === "perfect" ? "#ffe27a" : point.judgment === "good" ? "#64f5e7" : "#ff7a90";
                  return <circle key={point.id} cx={x} cy={clampedY} r="3.5" fill={color} opacity="0.85" />;
                })}
              </svg>
              <div className="practice-timing-graph-labels">
                <span className="practice-timing-label-fast">FAST −{MISS_WINDOW_MS}ms</span>
                <span className="practice-timing-label-zero">0ms</span>
                <span className="practice-timing-label-slow">SLOW +{MISS_WINDOW_MS}ms</span>
              </div>
              <div className="practice-timing-legend">
                <span className="practice-timing-legend-item"><span className="practice-timing-dot is-perfect" />PERFECT ±{PERFECT_WINDOW_MS}ms</span>
                <span className="practice-timing-legend-item"><span className="practice-timing-dot is-good" />GOOD ±{GOOD_WINDOW_MS}ms</span>
                <span className="practice-timing-legend-item"><span className="practice-timing-dot is-miss" />MISS</span>
                {timingHistory.length > 0 ? (
                  <span className="practice-timing-avg">
                    AVG {timingHistory.length > 0 ? (timingHistory.reduce((sum, p) => sum + p.deltaMs, 0) / timingHistory.length).toFixed(1) : "0"}ms
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        ) : null}
      </section>

      <style jsx>{`
        .practice-panel,
        .practice-rail-panel,
        .practice-stats-panel {
          display: grid;
          gap: 18px;
        }

        .practice-pattern-tabs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .practice-pattern-tab {
          border-radius: 999px;
          border: 1px solid var(--line);
          padding: 8px 14px;
          color: var(--muted);
          text-decoration: none;
          font-weight: 700;
          transition: border-color 140ms ease, color 140ms ease, background 140ms ease;
        }

        .practice-pattern-tab.is-active {
          border-color: rgba(100, 245, 231, 0.46);
          color: var(--accent-strong);
          background: rgba(57, 197, 187, 0.12);
        }

        .practice-control-header,
        .practice-rail-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          flex-wrap: wrap;
        }

        .practice-config-grid,
        .practice-key-grid {
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
        .practice-input:hover,
        .practice-pattern-tab:hover {
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

        .practice-rail.is-six {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }

        .practice-lane {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.025);
          border: 1px solid rgba(255, 255, 255, 0.05);
          z-index: 1;
        }

        .practice-lane.is-active {
          background: linear-gradient(180deg, rgba(57, 197, 187, 0.12), rgba(57, 197, 187, 0.03));
          border-color: rgba(100, 245, 231, 0.24);
        }

        .practice-lane.is-inactive {
          opacity: 0.55;
        }

        .practice-lane.is-next {
          box-shadow: inset 0 0 0 1px rgba(255, 243, 176, 0.32);
        }

        .practice-lane-press-effect {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background:
            radial-gradient(circle at 50% 78%, rgba(100, 245, 231, 0.34), rgba(100, 245, 231, 0) 58%),
            linear-gradient(180deg, rgba(100, 245, 231, 0.08) 0%, rgba(100, 245, 231, 0.26) 55%, rgba(100, 245, 231, 0.08) 100%);
          animation: practice-lane-press 120ms ease-out;
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

        .practice-lane-feedback-anchor {
          position: absolute;
          left: 10px;
          right: 10px;
          pointer-events: none;
          z-index: 5;
        }

        .practice-lane-feedback {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 12px;
          display: grid;
          gap: 3px;
          justify-items: center;
          text-align: center;
          padding: 8px 6px;
          border-radius: 12px;
          border: 1px solid rgba(100, 245, 231, 0.38);
          background: rgba(5, 16, 22, 0.84);
          pointer-events: none;
          z-index: 5;
          animation-name: lane-feedback-rise;
          animation-duration: ${LANE_FEEDBACK_DURATION_MS}ms;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
        }

        .practice-lane-feedback strong {
          font-size: 15px;
          line-height: 1;
          letter-spacing: 0.06em;
        }

        .practice-lane-feedback span {
          font-size: 18px;
          font-weight: 800;
          line-height: 1;
        }

        .practice-lane-feedback small {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
        }

        .practice-lane-feedback.is-perfect {
          color: #ffe27a;
          border-color: rgba(255, 226, 122, 0.48);
          box-shadow: 0 8px 24px rgba(255, 226, 122, 0.16);
        }

        .practice-lane-feedback.is-good {
          color: var(--accent-strong);
          border-color: rgba(100, 245, 231, 0.45);
          box-shadow: 0 8px 24px rgba(100, 245, 231, 0.18);
        }

        .practice-lane-feedback.is-miss {
          color: var(--danger);
          border-color: rgba(255, 122, 144, 0.45);
          box-shadow: 0 8px 24px rgba(255, 122, 144, 0.16);
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

        .practice-hit-effect {
          position: absolute;
          left: 6px;
          right: 6px;
          top: ${JUDGMENT_LINE_Y}px;
          height: 0;
          pointer-events: none;
          z-index: 4;
        }

        .practice-hit-spark {
          position: absolute;
          left: 50%;
          top: 0;
          width: 64px;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255, 243, 176, 0), rgba(255, 243, 176, 0.98), rgba(255, 243, 176, 0));
          box-shadow: 0 0 18px rgba(255, 226, 122, 0.45);
          transform-origin: center;
          animation: practice-hit-burst 260ms ease-out forwards;
        }

        .practice-hit-spark-center {
          transform: translate(-50%, -50%) scaleX(0.55);
        }

        .practice-hit-spark-left {
          transform: translate(-50%, -50%) rotate(-32deg) scaleX(0.42);
        }

        .practice-hit-spark-right {
          transform: translate(-50%, -50%) rotate(32deg) scaleX(0.42);
        }

        @keyframes practice-lane-press {
          0% {
            opacity: 0;
            transform: scaleY(0.92);
          }
          35% {
            opacity: 1;
            transform: scaleY(1);
          }
          100% {
            opacity: 0;
            transform: scaleY(1.04);
          }
        }

        @keyframes lane-feedback-rise {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          20% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-14px) scale(1.02);
          }
        }

        @keyframes practice-hit-burst {
          0% {
            opacity: 0.95;
          }
          100% {
            opacity: 0;
            width: 104px;
          }
        }

        .practice-beat-line {
          position: absolute;
          left: 14px;
          right: 14px;
          height: 1px;
          transform: translateY(-50%);
          background: rgba(194, 203, 214, 0.18);
          z-index: 0;
          pointer-events: none;
        }

        .practice-beat-line.is-measure {
          height: 2px;
          background: rgba(194, 203, 214, 0.34);
          box-shadow: 0 0 12px rgba(194, 203, 214, 0.1);
        }

        .practice-judgment-line {
          position: absolute;
          left: 14px;
          right: 14px;
          height: 3px;
          transform: translateY(-50%);
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(100, 245, 231, 0.3), rgba(236, 254, 255, 1), rgba(100, 245, 231, 0.3));
          box-shadow: 0 0 30px rgba(236, 254, 255, 0.36);
          z-index: 3;
        }

        .practice-rail-help {
          color: var(--muted);
          line-height: 1.6;
        }

        .practice-summary-box {
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.03);
          padding: 14px;
          display: grid;
          gap: 10px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .practice-summary-box strong {
          display: block;
          margin-top: 4px;
          font-size: 1.15rem;
        }

        .practice-judgment-number-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .practice-judgment-number-card {
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          padding: 14px;
          display: grid;
          gap: 6px;
        }

        .practice-judgment-number-card span {
          color: var(--muted);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .practice-judgment-number-card strong {
          font-size: 1.5rem;
          line-height: 1;
        }

        .practice-judgment-number-card.is-perfect strong {
          color: #ffe27a;
        }

        .practice-judgment-number-card.is-good strong {
          color: var(--accent-strong);
        }

        .practice-judgment-number-card.is-miss strong {
          color: var(--danger);
        }

        .practice-judgment-number-card.is-total strong {
          color: #eefcff;
          font-size: 1.2rem;
        }

        .practice-timing-graph-card {
          display: grid;
          gap: 14px;
        }

        .practice-timing-graph-wrap {
          display: grid;
          gap: 8px;
        }

        .practice-timing-svg {
          width: 100%;
          height: 180px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.02);
        }

        .practice-timing-graph-labels {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--muted);
        }

        .practice-timing-label-fast {
          color: var(--accent-strong);
        }

        .practice-timing-label-zero {
          color: var(--text);
        }

        .practice-timing-label-slow {
          color: var(--danger);
        }

        .practice-timing-legend {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          align-items: center;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--muted);
        }

        .practice-timing-legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .practice-timing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .practice-timing-dot.is-perfect {
          background: #ffe27a;
        }

        .practice-timing-dot.is-good {
          background: var(--accent-strong);
        }

        .practice-timing-dot.is-miss {
          background: var(--danger);
        }

        .practice-timing-avg {
          margin-left: auto;
          color: var(--text);
          font-size: 13px;
        }

        @media (max-width: 980px) {
          .practice-play-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .practice-config-grid,
          .practice-key-grid,
          .practice-summary-box {
            grid-template-columns: 1fr;
          }

          .practice-rail,
          .practice-rail.is-six {
            gap: 6px;
            padding: 10px;
          }
        }
      `}</style>
    </main>
  );
}
