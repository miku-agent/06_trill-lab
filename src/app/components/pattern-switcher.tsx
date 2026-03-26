"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PATTERN_DEFINITIONS, getPatternDefinition } from "../lib/patterns";

function trackPatternSelect(pattern: string) {
  if (typeof window === "undefined") return;
  const browserWindow = window as Window & { dataLayer?: Array<Record<string, unknown>> };
  browserWindow.dataLayer = browserWindow.dataLayer ?? [];
  browserWindow.dataLayer.push({ event: "pattern_select", pattern, source: "switcher" });
}

export function PatternSwitcher() {
  const searchParams = useSearchParams();
  const activePattern = getPatternDefinition(searchParams.get("pattern"));

  return (
    <div className="pattern-switcher" aria-label="패턴 선택">
      {PATTERN_DEFINITIONS.map((pattern) => {
        const isActive = pattern.key === activePattern.key;
        return (
          <Link
            key={pattern.key}
            href={pattern.href}
            className={`pattern-switcher-link ${isActive ? "is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={() => trackPatternSelect(pattern.key)}
          >
            {pattern.shortLabel}
          </Link>
        );
      })}
    </div>
  );
}
