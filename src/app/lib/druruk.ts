export type DrurukKeyCount = 4 | 6;
export type DrurukVariant = "1234" | "4321" | "123456" | "654321";
export type DrurukDirection = "forward" | "reverse";

export type DrurukProfile = {
  keyCount: DrurukKeyCount;
  variant: DrurukVariant;
  direction: DrurukDirection;
  title: string;
  description: string;
  sequenceLabel: string;
  defaultKeys: string[];
};

const DRURUK_PROFILES: Record<DrurukVariant, DrurukProfile> = {
  "1234": {
    keyCount: 4,
    variant: "1234",
    direction: "forward",
    title: "4키 1234 모드",
    description: "A → S → K → L 순서로 4키를 입력해요.",
    sequenceLabel: "1 → 2 → 3 → 4",
    defaultKeys: ["A", "S", "K", "L"],
  },
  "4321": {
    keyCount: 4,
    variant: "4321",
    direction: "reverse",
    title: "4키 4321 모드",
    description: "L → K → S → A 순서로 4키를 입력해요.",
    sequenceLabel: "4 → 3 → 2 → 1",
    defaultKeys: ["L", "K", "S", "A"],
  },
  "123456": {
    keyCount: 6,
    variant: "123456",
    direction: "forward",
    title: "6키 123456 모드",
    description: "A → S → D → J → K → L 순서로 6키를 입력해요.",
    sequenceLabel: "1 → 2 → 3 → 4 → 5 → 6",
    defaultKeys: ["A", "S", "D", "J", "K", "L"],
  },
  "654321": {
    keyCount: 6,
    variant: "654321",
    direction: "reverse",
    title: "6키 654321 모드",
    description: "L → K → J → D → S → A 순서로 6키를 입력해요.",
    sequenceLabel: "6 → 5 → 4 → 3 → 2 → 1",
    defaultKeys: ["L", "K", "J", "D", "S", "A"],
  },
};

export const DRURUK_VARIANTS = Object.keys(DRURUK_PROFILES) as DrurukVariant[];

export function isDrurukVariant(value: string | null | undefined): value is DrurukVariant {
  return value === "1234" || value === "4321" || value === "123456" || value === "654321";
}

export function getDrurukProfile(variant: DrurukVariant): DrurukProfile {
  return DRURUK_PROFILES[variant];
}

export function getDrurukVariantsByKeyCount(keyCount: DrurukKeyCount) {
  return DRURUK_VARIANTS.filter((variant) => DRURUK_PROFILES[variant].keyCount === keyCount);
}

export function getDefaultDrurukVariant(keyCount: DrurukKeyCount): DrurukVariant {
  return keyCount === 4 ? "1234" : "123456";
}

export function getDrurukKeyLabels(keyCount: DrurukKeyCount) {
  return Array.from({ length: keyCount }, (_, index) => `${index + 1}번 키`);
}

export function getDrurukKeyHints(keyCount: DrurukKeyCount) {
  const hintsByCount: Record<DrurukKeyCount, string[]> = {
    4: ["예: A", "예: S", "예: K", "예: L"],
    6: ["예: A", "예: S", "예: D", "예: J", "예: K", "예: L"],
  };

  return hintsByCount[keyCount];
}

export function getDrurukLaneIndexes(keyCount: DrurukKeyCount, direction: DrurukDirection) {
  const forward = Array.from({ length: keyCount }, (_, index) => index);
  return direction === "forward" ? forward : [...forward].reverse();
}
