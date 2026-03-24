"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SessionState = "idle" | "countdown" | "running" | "finished";
type ModeKey = "measure" | "challenge" | "practice";
type MeasureVariant = "left" | "right" | "both";
type KeyCaptureTarget = "primary" | "secondary" | null;

type Result = {
  bpm: number;
  validHits: number;
  invalidHits: number;
  accuracy: number;
  peakStreak: number;
};

type ModeCard = {
  key: ModeKey;
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  bullets: string[];
};

type MeasurePreset = {
  key: MeasureVariant;
  title: string;
  description: string;
  defaultKeys: [string, string];
};

const COUNTDOWN_SECONDS = 3;
const TEST_SECONDS = 10;

const MODE_CARDS: ModeCard[] = [
  {
    key: "measure",
    eyebrow: "MODE 01",
    title: "Measure Mode",
    description: "A focused test mode for checking your current speed ceiling.",
    status: "LIVE",
    bullets: ["16th-note BPM estimate", "Accuracy + streak tracking", "Built for repeat score attempts"],
  },
  {
    key: "challenge",
    eyebrow: "MODE 02",
    title: "Challenge Mode",
    description: "Planned as a survival-style mode built around target BPM goals.",
    status: "COMING SOON",
    bullets: ["Target BPM selection", "Timed survival missions", "Clear / fail judgement"],
  },
  {
    key: "practice",
    eyebrow: "MODE 03",
    title: "Practice Mode",
    description: "A training mode for building control step by step from slower speeds.",
    status: "COMING SOON",
    bullets: ["Speed step loops", "Left/right stability practice", "Expandable pattern drills"],
  },
];

const MEASURE_PRESETS: MeasurePreset[] = [
  {
    key: "left",
    title: "Left Hand",
    description: "Measure a one-hand trill using two left-hand keys.",
    defaultKeys: ["A", "S"],
  },
  {
    key: "right",
    title: "Right Hand",
    description: "Measure a one-hand trill using two right-hand keys.",
    defaultKeys: ["K", "L"],
  },
  {
    key: "both",
    title: "Both Hands",
    description: "Measure a standard alternating trill with split left/right keys.",
    defaultKeys: ["A", "L"],
  },
];

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
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

function getPresetConfig(variant: MeasureVariant) {
  return MEASURE_PRESETS.find((preset) => preset.key === variant) ?? MEASURE_PRESETS[0];
}

export default function HomePage() {
  const [selectedMode, setSelectedMode] = useState<ModeKey>("measure");
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
  const deadlineRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const validHitsRef = useRef(0);
  const invalidHitsRef = useRef(0);
  const peakStreakRef = useRef(0);

  const selectedCard = MODE_CARDS.find((card) => card.key === selectedMode) ?? MODE_CARDS[0];
  const activePreset = getPresetConfig(measureVariant);
  const configuredKeys = useMemo(() => [normalizeKey(primaryKey), normalizeKey(secondaryKey)], [primaryKey, secondaryKey]);
  const hasValidKeyConfig = configuredKeys[0].length > 0 && configuredKeys[1].length > 0 && configuredKeys[0] !== configuredKeys[1];

  const helperText = useMemo(() => {
    if (selectedMode !== "measure") {
      return "This mode is still a layout stub. Try Measure Mode first.";
    }

    if (keyCaptureTarget) {
      return keyCaptureTarget === "primary"
        ? "Listening for the primary key. Press any key now. Press ESC to cancel."
        : "Listening for the secondary key. Press any key now. Press ESC to cancel.";
    }

    if (!hasValidKeyConfig) {
      return "Choose two different keys before starting the test.";
    }

    if (sessionState === "countdown") {
      return `Get ready... starting in ${countdownLeft}`;
    }

    if (sessionState === "running") {
      return `Use only ${configuredKeys[0]} and ${configuredKeys[1]}, alternating as cleanly as possible.`;
    }

    if (result) {
      return "Repeating the same key counts as invalid. Push speed without losing accuracy.";
    }

    return `Using ${configuredKeys[0]} / ${configuredKeys[1]} for ${activePreset.title}. Push your fastest trill for 10 seconds.`;
  }, [activePreset.title, configuredKeys, countdownLeft, hasValidKeyConfig, keyCaptureTarget, result, selectedMode, sessionState]);

  const finishRun = useCallback(() => {
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("finished");

    const totalHits = validHitsRef.current + invalidHitsRef.current;
    const accuracy = totalHits === 0 ? 0 : (validHitsRef.current / totalHits) * 100;
    const bpm = Math.round((validHitsRef.current / 4 / TEST_SECONDS) * 60);

    setResult({
      bpm,
      validHits: validHitsRef.current,
      invalidHits: invalidHitsRef.current,
      accuracy,
      peakStreak: peakStreakRef.current,
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
    deadlineRef.current = null;
    runningRef.current = false;
    validHitsRef.current = 0;
    invalidHitsRef.current = 0;
    peakStreakRef.current = 0;
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (keyCaptureTarget) {
        event.preventDefault();
        if (event.key === "Escape") {
          setKeyCaptureTarget(null);
          return;
        }
        const pressedKey = normalizeKey(event.key);
        if (!pressedKey) return;
        if (keyCaptureTarget === "primary") setPrimaryKey(pressedKey);
        else setSecondaryKey(pressedKey);
        setKeyCaptureTarget(null);
        runningRef.current = false;
        deadlineRef.current = null;
        setSessionState("idle");
        resetStats();
        return;
      }

      const pressedKey = normalizeKey(event.key);
      if (!pressedKey) return;
      if (!runningRef.current || !hasValidKeyConfig || !configuredKeys.includes(pressedKey)) return;

      event.preventDefault();
      setLatestInput(pressedKey);

      if (lastAcceptedKey === null || lastAcceptedKey !== pressedKey) {
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

      setInvalidHits((current) => {
        const next = current + 1;
        invalidHitsRef.current = next;
        return next;
      });
      setCurrentStreak(0);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [configuredKeys, hasValidKeyConfig, keyCaptureTarget, lastAcceptedKey, resetStats]);

  function startRun() {
    if (selectedMode !== "measure" || !hasValidKeyConfig || keyCaptureTarget !== null) return;
    resetStats();
    setSessionState("countdown");
  }

  function changeMode(mode: ModeKey) {
    setSelectedMode(mode);
    setKeyCaptureTarget(null);
    runningRef.current = false;
    deadlineRef.current = null;
    setSessionState("idle");
    resetStats();
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
    setKeyCaptureTarget(target);
    resetStats();
  }

  const statusTone = sessionState === "running" ? "running" : sessionState === "finished" ? "finished" : "idle";

  return (
    <main style={{ padding: "32px 16px 80px" }}>
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto", display: "grid", gap: 24 }}>
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 28,
            padding: 28,
            backdropFilter: "blur(18px)",
            boxShadow: "0 20px 80px rgba(0, 0, 0, 0.28)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, alignItems: "end" }}>
            <div>
              <p style={{ color: "var(--accent-strong)", margin: 0, fontWeight: 700, letterSpacing: "0.08em" }}>TRILL LAB</p>
              <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 4.5rem)", margin: "12px 0 14px" }}>Measure it, hold it, train it</h1>
              <p style={{ color: "var(--muted)", margin: 0, lineHeight: 1.8, maxWidth: 680 }}>
                Measure Mode now supports <strong>Left Hand / Right Hand / Both Hands</strong> presets and custom key binding.
                Pick your setup first, then test your actual speed ceiling.
              </p>
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 24, padding: 20, background: "rgba(255,255,255,0.03)" }}>
              <p style={{ marginTop: 0, color: "var(--muted)" }}>Current status</p>
              <div style={{ display: "grid", gap: 10 }}>
                <QuickStat label="Active mode" value={selectedCard.title} />
                <QuickStat label="Measure preset" value={activePreset.title} />
                <QuickStat label="Keys" value={`${configuredKeys[0] || "_"} / ${configuredKeys[1] || "_"}`} />
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {MODE_CARDS.map((card) => {
            const isActive = card.key === selectedMode;
            return (
              <button
                key={card.key}
                onClick={() => changeMode(card.key)}
                style={{
                  textAlign: "left",
                  borderRadius: 24,
                  border: isActive ? "1px solid rgba(100, 245, 231, 0.7)" : "1px solid var(--line)",
                  background: isActive ? "rgba(57, 197, 187, 0.12)" : "var(--panel-strong)",
                  padding: 22,
                  cursor: "pointer",
                  color: "var(--text)",
                  boxShadow: isActive ? "0 0 0 1px rgba(100, 245, 231, 0.14) inset" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span style={{ color: "var(--accent-strong)", fontWeight: 700, letterSpacing: "0.06em" }}>{card.eyebrow}</span>
                  <span style={{ borderRadius: 999, padding: "6px 10px", fontSize: 12, fontWeight: 700, background: isActive ? "rgba(100, 245, 231, 0.16)" : "rgba(255,255,255,0.06)" }}>
                    {card.status}
                  </span>
                </div>
                <h2 style={{ margin: "14px 0 8px", fontSize: 28 }}>{card.title}</h2>
                <p style={{ color: "var(--muted)", lineHeight: 1.7, minHeight: 54 }}>{card.description}</p>
                <ul style={{ paddingLeft: 18, color: "var(--muted)", marginBottom: 0, lineHeight: 1.8 }}>
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr", gap: 20 }}>
          <article style={{ background: "var(--panel-strong)", border: "1px solid var(--line)", borderRadius: 28, padding: 24, display: "grid", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
              <div>
                <p style={{ color: "var(--muted)", margin: 0 }}>Selected mode</p>
                <h3 style={{ margin: "8px 0 10px", fontSize: 32 }}>{selectedCard.title}</h3>
                <p style={{ color: "var(--muted)", margin: 0, lineHeight: 1.8 }}>{helperText}</p>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 999,
                  padding: "8px 14px",
                  background: statusTone === "running" ? "rgba(57, 197, 187, 0.14)" : statusTone === "finished" ? "rgba(100, 245, 231, 0.14)" : "rgba(255, 255, 255, 0.06)",
                  border: "1px solid var(--line)",
                  fontWeight: 700,
                  height: "fit-content",
                }}
              >
                {selectedMode !== "measure"
                  ? selectedCard.status
                  : sessionState === "countdown"
                    ? `COUNTDOWN ${countdownLeft}`
                    : sessionState === "running"
                      ? `RUNNING ${timeLeft.toFixed(1)}s`
                      : sessionState === "finished"
                        ? "FINISHED"
                        : keyCaptureTarget
                          ? "LISTENING"
                          : "READY"}
              </div>
            </div>

            {selectedMode === "measure" ? (
              <>
                <div style={{ borderRadius: 22, padding: 20, border: "1px solid var(--line)", background: "rgba(255,255,255,0.02)", display: "grid", gap: 18 }}>
                  <div>
                    <p style={{ color: "var(--muted)", marginTop: 0 }}>Hand preset</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                      {MEASURE_PRESETS.map((preset) => {
                        const isActive = preset.key === measureVariant;
                        return (
                          <button
                            key={preset.key}
                            onClick={() => applyPreset(preset.key)}
                            disabled={sessionState === "countdown" || sessionState === "running"}
                            style={{
                              textAlign: "left",
                              borderRadius: 18,
                              border: isActive ? "1px solid rgba(100, 245, 231, 0.7)" : "1px solid var(--line)",
                              background: isActive ? "rgba(57, 197, 187, 0.12)" : "rgba(255,255,255,0.02)",
                              color: "var(--text)",
                              padding: 16,
                              cursor: "pointer",
                            }}
                          >
                            <strong style={{ display: "block", marginBottom: 8 }}>{preset.title}</strong>
                            <span style={{ color: "var(--muted)", lineHeight: 1.6 }}>{preset.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p style={{ color: "var(--muted)", marginTop: 0 }}>Key binding</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                      <KeySettingCard
                        label="Primary key"
                        value={primaryKey}
                        hint={measureVariant === "left" ? "Example: A" : measureVariant === "right" ? "Example: K" : "Example: A"}
                        isCapturing={keyCaptureTarget === "primary"}
                        onStartCapture={() => beginKeyCapture("primary")}
                        disabled={sessionState === "countdown" || sessionState === "running"}
                      />
                      <KeySettingCard
                        label="Secondary key"
                        value={secondaryKey}
                        hint={measureVariant === "left" ? "Example: S" : measureVariant === "right" ? "Example: L" : "Example: L"}
                        isCapturing={keyCaptureTarget === "secondary"}
                        onStartCapture={() => beginKeyCapture("secondary")}
                        disabled={sessionState === "countdown" || sessionState === "running"}
                      />
                    </div>
                    <p style={{ color: hasValidKeyConfig ? "var(--muted)" : "var(--danger)", marginBottom: 0, marginTop: 12 }}>
                      {hasValidKeyConfig ? `Current setup: ${configuredKeys[0]} / ${configuredKeys[1]}.` : "Choose two different keys before starting."}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    onClick={startRun}
                    disabled={sessionState === "countdown" || sessionState === "running" || !hasValidKeyConfig || keyCaptureTarget !== null}
                    style={{
                      border: 0,
                      borderRadius: 16,
                      padding: "14px 18px",
                      background: "linear-gradient(135deg, var(--accent), var(--accent-strong))",
                      color: "#062127",
                      fontWeight: 800,
                      cursor: hasValidKeyConfig ? "pointer" : "not-allowed",
                      opacity: hasValidKeyConfig ? 1 : 0.5,
                    }}
                  >
                    {result ? "Run again" : "Start test"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <Stat label="Last input" value={latestInput} />
                  <Stat label="Valid hits" value={String(validHits)} />
                  <Stat label="Invalid hits" value={String(invalidHits)} />
                  <Stat label="Current streak" value={String(currentStreak)} />
                  <Stat label="Best streak" value={String(peakStreak)} />
                </div>

                <div style={{ borderRadius: 22, padding: 20, border: "1px solid var(--line)", background: "rgba(255,255,255,0.02)" }}>
                  <p style={{ color: "var(--muted)", marginTop: 0 }}>Result</p>
                  <h2 style={{ margin: "0 0 8px", fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
                    {result ? `Current result: ${result.bpm} BPM (16th-note trill)` : "No result yet"}
                  </h2>
                  <p style={{ color: "var(--muted)", marginBottom: 0 }}>
                    {result
                      ? `${activePreset.title} · ${configuredKeys[0]} / ${configuredKeys[1]} · Accuracy ${formatPercent(result.accuracy)} · Valid ${result.validHits} · Invalid ${result.invalidHits} · Best streak ${result.peakStreak}`
                      : "BPM, accuracy, and streak stats will appear after the run."}
                  </p>
                </div>
              </>
            ) : (
              <div style={{ borderRadius: 22, padding: 24, border: "1px dashed var(--line)", background: "rgba(255,255,255,0.02)", color: "var(--muted)", lineHeight: 1.8 }}>
                <strong style={{ color: "var(--text)" }}>{selectedCard.title}</strong>
                <p style={{ marginBottom: 0 }}>
                  Each mode will get its own dedicated play UI here. For now, the product structure comes first: mode cards, the main play panel,
                  and a supporting side panel.
                </p>
              </div>
            )}
          </article>

          <aside style={{ display: "grid", gap: 20 }}>
            <article style={{ background: "var(--panel-strong)", border: "1px solid var(--line)", borderRadius: 28, padding: 24 }}>
              <p style={{ color: "var(--muted)", marginTop: 0 }}>Design notes</p>
              <h3 style={{ margin: "8px 0 14px" }}>Measure Mode updates</h3>
              <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.8, marginBottom: 0 }}>
                <li>Left / Right / Both Hands are split into separate presets</li>
                <li>After choosing a preset, press any key to bind instantly</li>
                <li>The start button is disabled when both keys are the same</li>
                <li>The same binding flow can be reused for Challenge and Practice Mode later</li>
              </ul>
            </article>

            <article style={{ background: "var(--panel-strong)", border: "1px solid var(--line)", borderRadius: 28, padding: 24, color: "var(--muted)" }}>
              <p style={{ color: "var(--muted)", marginTop: 0 }}>Rules</p>
              <ul style={{ paddingLeft: 20, marginBottom: 0, lineHeight: 1.8 }}>
                <li>Only the two selected keys are counted.</li>
                <li>You must alternate between them for a valid hit.</li>
                <li>Repeating the same key becomes an invalid hit and breaks the streak.</li>
                <li>Changing a key binding resets the current session.</li>
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 8, padding: "14px 16px", borderRadius: 16, border: "1px solid var(--line)", background: "rgba(255, 255, 255, 0.02)" }}>
      <span style={{ color: "var(--muted)", fontSize: 14 }}>{label}</span>
      <strong style={{ fontSize: 22 }}>{value}</strong>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 16, border: "1px solid var(--line)", background: "rgba(255,255,255,0.02)" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <strong>{value}</strong>
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
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 16,
        borderRadius: 18,
        border: isCapturing ? "1px solid rgba(100, 245, 231, 0.7)" : "1px solid var(--line)",
        background: isCapturing ? "rgba(57, 197, 187, 0.08)" : "rgba(255,255,255,0.02)",
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <div
        style={{
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "rgba(7, 19, 26, 0.9)",
          color: "var(--text)",
          padding: "12px 14px",
          fontSize: 20,
          fontWeight: 700,
          minHeight: 50,
          display: "flex",
          alignItems: "center",
        }}
      >
        {normalizeKey(value) || "-"}
      </div>
      <button
        type="button"
        onClick={onStartCapture}
        disabled={disabled}
        style={{
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: isCapturing ? "rgba(57, 197, 187, 0.16)" : "rgba(255,255,255,0.04)",
          color: "var(--text)",
          padding: "10px 12px",
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {isCapturing ? "Press any key..." : "Change key"}
      </button>
      <span style={{ color: "var(--muted)", fontSize: 13 }}>
        {isCapturing ? "The next key press will be saved to this slot. Press ESC to cancel." : hint}
      </span>
    </div>
  );
}
