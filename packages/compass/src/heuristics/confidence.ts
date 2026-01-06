export const HEURISTICS = {
  DEFAULT_CONFIDENCE: 0.5,
  VALIDATE_DELTA: 0.05,
  VIOLATE_DELTA: 0.1,
  GOLDEN_THRESHOLD: 0.9,
  MIN_VALIDATIONS_FOR_GOLDEN: 3,
  DECAY_HALF_LIFE_DAYS: 30,
  MIN_EFFECTIVE_CONFIDENCE: 0.1,
  MAX_INJECTION_COUNT: 5,
  MAX_INJECTION_TOKENS: 500,
} as const;

export function getEffectiveConfidence(
  confidence: number,
  isGolden: boolean,
  lastValidatedAt: number | null,
  createdAt: number
): number {
  if (isGolden) return confidence;

  const lastActivity = lastValidatedAt ?? createdAt;
  const daysSinceActivity = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.5, daysSinceActivity / HEURISTICS.DECAY_HALF_LIFE_DAYS);

  return confidence * decayFactor;
}

export function calculateValidatedConfidence(currentConfidence: number): number {
  return Math.min(1.0, currentConfidence + HEURISTICS.VALIDATE_DELTA);
}

export function calculateViolatedConfidence(currentConfidence: number): number {
  return Math.max(0.0, currentConfidence - HEURISTICS.VIOLATE_DELTA);
}

export function shouldPromoteToGolden(
  confidence: number,
  timesValidated: number,
  timesViolated: number
): boolean {
  return (
    confidence >= HEURISTICS.GOLDEN_THRESHOLD &&
    timesValidated >= HEURISTICS.MIN_VALIDATIONS_FOR_GOLDEN &&
    timesViolated === 0
  );
}

export function shouldDemoteFromGolden(timesViolated: number): boolean {
  return timesViolated > 0;
}
