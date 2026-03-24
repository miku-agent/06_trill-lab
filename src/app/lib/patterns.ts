export type PatternKey = "trill" | "druruk";

export type PatternDefinition = {
  key: PatternKey;
  label: string;
  shortLabel: string;
  description: string;
  href: string;
};

export const PATTERN_DEFINITIONS: PatternDefinition[] = [
  {
    key: "trill",
    label: "트릴",
    shortLabel: "트릴",
    description: "두 키를 번갈아 눌러 BPM과 일정함을 측정해요.",
    href: "/measure?pattern=trill",
  },
  {
    key: "druruk",
    label: "드르륵",
    shortLabel: "드르륵",
    description: "1234 또는 4321 모드로 4키 입력 속도와 안정감을 측정해요.",
    href: "/measure?pattern=druruk",
  },
];

export function getPatternDefinition(pattern: string | null | undefined) {
  return PATTERN_DEFINITIONS.find((item) => item.key === pattern) ?? PATTERN_DEFINITIONS[0];
}
