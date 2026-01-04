export const ALL_CONCEPT_TYPES = [
  "pattern",
  "rule",
  "constraint",
  "decision",
  "context",
  "learning"
] as const;

// Types that should be injected into the LLM context as heuristics
// "learning" is excluded here because it's handled separately as failure warnings
export const INJECTABLE_CONCEPT_TYPES = [
  "pattern",
  "rule",
  "constraint",
  "decision",
  "context"
] as const;

export type ConceptType = typeof ALL_CONCEPT_TYPES[number];
