import type { TagEntry, TagOrGroup } from './types';

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, '');
}

export function findByName(input: string, candidates: string[]): string | null {
  const exactMatch = candidates.find(c => c === input);
  if (exactMatch) return exactMatch;

  const nInput = normalize(input);
  const normalizedMatch = candidates.find(c => normalize(c) === nInput);
  return normalizedMatch || null;
}

export function findBestMatch(typo: string, candidates: string[]): string | null {
  const matches = findAllMatches(typo, candidates);
  return matches.length > 0 ? matches[0] : null;
}

export function findAllMatches(typo: string, candidates: string[], limit = 3): string[] {
  const nTypo = normalize(typo);
  if (nTypo.length < 1) return [];

  const exact = candidates.filter(c => normalize(c) === nTypo);
  if (exact.length > 0) return exact.slice(0, limit);

  const prefixMatches = candidates
    .filter(c => normalize(c).startsWith(nTypo))
    .sort((a, b) => normalize(a).length - normalize(b).length);
  
  return prefixMatches.slice(0, limit);
}

export function isOrGroup(entry: TagEntry): entry is TagOrGroup {
  return typeof entry === 'object' && !Array.isArray(entry) && 'or' in entry;
}

export function matchesTagItem(item: string | TagOrGroup, lowerContent: string): boolean {
  if (typeof item === 'string') {
    if (item.includes('|')) {
      const parts = item.split('|').map(s => s.trim().toLowerCase());
      return parts.some(part => lowerContent.includes(part));
    }
    return lowerContent.includes(item.toLowerCase());
  } else if (isOrGroup(item)) {
    return item.or.some(sub => lowerContent.includes(sub.toLowerCase()));
  }
  return false;
}
