import type { TagEntry, TagOrGroup, SequenceTag, SequenceStep } from './types';

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, '');
}

export function matchesWord(content: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  return regex.test(content);
}

export function findWordPosition(content: string, word: string, afterPos = -1): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > afterPos) {
      return match.index;
    }
  }
  return -1;
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
      return parts.some(part => matchesWord(lowerContent, part));
    }
    return matchesWord(lowerContent, item.toLowerCase());
  } else if (isOrGroup(item)) {
    return item.or.some(sub => matchesWord(lowerContent, sub.toLowerCase()));
  }
  return false;
}

export function isSequenceTag(entry: TagEntry): entry is SequenceTag {
  return typeof entry === 'object' && !Array.isArray(entry) && 'sequence' in entry;
}

export function parseSequenceTag(raw: string): SequenceTag {
  const steps = raw.split('->').map(s => s.trim());
  const sequence: SequenceStep[] = steps.map(step => {
    if (step.startsWith('(') && step.endsWith(')')) {
      const inner = step.slice(1, -1);
      const values = inner.split('|').map(s => s.trim().toLowerCase());
      return { type: 'or' as const, values };
    }
    if (step.startsWith('[') && step.endsWith(']')) {
      const inner = step.slice(1, -1);
      const values = inner.split(',').map(s => s.trim().toLowerCase());
      return { type: 'and' as const, values };
    }
    return { type: 'word' as const, values: [step.toLowerCase()] };
  });
  return { sequence };
}

export function hasSequenceSyntax(tag: string): boolean {
  return tag.includes('->');
}

interface SequenceMatchResult {
  matches: boolean;
  keywords: string[];
}

export function matchesSequenceTag(seq: SequenceTag, lowerContent: string): SequenceMatchResult {
  let lastPos = -1;
  const keywords: string[] = [];

  for (const step of seq.sequence) {
    const result = findStepInContent(step, lowerContent, lastPos);
    if (!result) {
      return { matches: false, keywords: [] };
    }
    lastPos = result.position;
    keywords.push(result.keyword);
  }

  return { matches: true, keywords };
}

function findStepInContent(
  step: SequenceStep,
  content: string,
  afterPos: number
): { position: number; keyword: string } | null {
  if (step.type === 'word') {
    const word = step.values[0];
    const pos = findWordPosition(content, word, afterPos);
    if (pos === -1) return null;
    return { position: pos, keyword: word };
  }

  if (step.type === 'or') {
    let bestMatch: { position: number; keyword: string } | null = null;
    for (const word of step.values) {
      const pos = findWordPosition(content, word, afterPos);
      if (pos !== -1 && (bestMatch === null || pos < bestMatch.position)) {
        bestMatch = { position: pos, keyword: word };
      }
    }
    return bestMatch;
  }

  if (step.type === 'and') {
    let maxPos = -1;
    const matchedKeywords: string[] = [];
    for (const word of step.values) {
      const pos = findWordPosition(content, word, afterPos);
      if (pos === -1) return null;
      if (pos > maxPos) maxPos = pos;
      matchedKeywords.push(word);
    }
    return { position: maxPos, keyword: matchedKeywords.join('+') };
  }

  return null;
}
