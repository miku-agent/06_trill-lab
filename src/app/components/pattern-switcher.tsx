"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PATTERN_DEFINITIONS, getPatternDefinition } from "../lib/patterns";

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
          >
            {pattern.shortLabel}
          </Link>
        );
      })}
    </div>
  );
}
