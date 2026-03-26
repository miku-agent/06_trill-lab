export type PatternKey = "trill" | "druruk" | "yeonta";

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
    description: "4키(1234 / 4321) 또는 6키(123456 / 654321) 입력 속도와 안정감을 측정해요.",
    href: "/measure?pattern=druruk",
  },
  {
    key: "yeonta",
    label: "연타",
    shortLabel: "연타",
    description: "A / S / ; / ' 를 각각 4연타씩 반복하는 패턴 속도와 안정감을 측정해요.",
    href: "/measure?pattern=yeonta",
  },
];

export function getPatternDefinition(pattern: string | null | undefined) {
  return PATTERN_DEFINITIONS.find((item) => item.key === pattern) ?? PATTERN_DEFINITIONS[0];
}
