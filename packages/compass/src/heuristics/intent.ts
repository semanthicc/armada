const HISTORY_PATTERNS = [
  /\bwhy\s+(is|was|does|did|do)\b/i,
  /\bhistory\b/i,
  /\bevolution\b/i,
  /\bhow\s+did\s+(this|it|we)\s+(change|evolve)/i,
  /\bprevious(ly)?\b/i,
  /\boriginal(ly)?\b/i,
  /\bused\s+to\b/i,
  /\bchange(d)?\s+from\b/i,
  /\bevolve(d)?\s+from\b/i,
  /\bsupersede(d)?\b/i,
  /\bolder\s+version/i,
  /\bwhat\s+was\s+before\b/i,
];

export function detectHistoryIntent(text: string): boolean {
  return HISTORY_PATTERNS.some((pattern) => pattern.test(text));
}
