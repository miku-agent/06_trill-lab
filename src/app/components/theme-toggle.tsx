"use client";

import { useState, useCallback, useSyncExternalStore } from "react";

type Theme = "dark" | "light" | "system";

const THEME_KEY = "trill-theme";

const THEME_CYCLE: Record<Theme, Theme> = {
  dark: "light",
  light: "system",
  system: "dark",
};

const THEME_ICON: Record<Theme, string> = {
  dark: "\u263E",
  light: "\u2600",
  system: "\u25D1",
};

const THEME_LABEL: Record<Theme, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* private browsing */
  }
  return "system";
}

function applyTheme(theme: Theme) {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private browsing */
  }
}

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  const handleToggle = useCallback(() => {
    setTheme((prev) => {
      const next = THEME_CYCLE[prev];
      applyTheme(next);
      return next;
    });
  }, []);

  if (!mounted) return null;

  return (
    <button
      className="theme-toggle"
      onClick={handleToggle}
      type="button"
      aria-label={`테마 변경: 현재 ${THEME_LABEL[theme]}`}
    >
      <span className="theme-toggle-icon">{THEME_ICON[theme]}</span>
      {THEME_LABEL[theme]}
    </button>
  );
}
