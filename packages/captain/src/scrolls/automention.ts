import type { TagOrGroup, Theme } from '../core/types';
import type { Scroll, Order } from './types';
import { isOrGroup, matchesTagItem, isSequenceTag, matchesSequenceTag, hasSequenceSyntax, parseSequenceTag, matchesWord } from '../core/matcher';
import { extractOrderReferences } from './engine';
import { getMessage } from '../core/config';

export interface AutoOrderMatchResult {
  autoApply: string[];
  expandedApply: string[];
  matchedKeywords: Map<string, string[]>;
}

export interface SpawnMatchResult {
  hints: string[];
  expanded: string[];
}

export function findMatchingAutoOrders(
  userContent: string,
  orders: Order[],
  activeAgent?: string,
  explicitlyMentioned: string[] = []
): AutoOrderMatchResult {
  const matchedKeywords = new Map<string, string[]>();

  const detectedRefs = extractOrderReferences(userContent);
  const allExplicit = new Set([
    ...explicitlyMentioned.map(n => n.toLowerCase()),
    ...detectedRefs.map(n => n.toLowerCase())
  ]);

  const contentForMatching = userContent
    .replace(/\[use_workflow:[^\]]+\]/g, '')
    .replace(/<workflow[^>]*>[\s\S]*?<\/workflow>/g, '')
    .replace(/use_workflow:\S+/g, '')
    .toLowerCase();

  const matchingOrders: Order[] = [];

  for (const w of orders) {
    if (w.automention === 'false') continue;
    if (w.onlyFor.length > 0 && (!activeAgent || !w.onlyFor.includes(activeAgent))) continue;
    if (allExplicit.has(w.name.toLowerCase())) continue;
    if (w.aliases.some(a => allExplicit.has(a.toLowerCase()))) continue;

    const keywords: string[] = [];
    let singleMatches = 0;
    let groupMatched = false;
    
    for (const tag of w.tags) {
      if (isSequenceTag(tag)) {
        const result = matchesSequenceTag(tag, contentForMatching);
        if (result.matches) {
          groupMatched = true;
          keywords.push(...result.keywords);
        }
      } else if (typeof tag === 'string' && hasSequenceSyntax(tag)) {
        const seqTag = parseSequenceTag(tag);
        const result = matchesSequenceTag(seqTag, contentForMatching);
        if (result.matches) {
          groupMatched = true;
          keywords.push(...result.keywords);
        }
      } else if (Array.isArray(tag)) {
        const groupKeywords: string[] = [];
        const allInGroup = tag.every(t => {
          const matched = matchesTagItem(t, contentForMatching);
          if (matched) {
            const keyword = typeof t === 'string' ? t : (t as TagOrGroup).or.find(o => matchesWord(contentForMatching, o.toLowerCase())) || '';
            if (keyword) groupKeywords.push(keyword);
          }
          return matched;
        });
        if (allInGroup && tag.length > 0) {
          groupMatched = true;
          keywords.push(...groupKeywords);
        }
      } else if (isOrGroup(tag)) {
        const matched = tag.or.find(t => matchesWord(contentForMatching, t.toLowerCase()));
        if (matched) {
          singleMatches++;
          keywords.push(matched);
        }
      } else if (typeof tag === 'string') {
        if (tag.includes('|')) {
          const parts = tag.split('|').map(s => s.trim());
          const matched = parts.find(part => matchesWord(contentForMatching, part.toLowerCase()));
          if (matched) {
            singleMatches++;
            keywords.push(matched);
          }
        } else if (matchesWord(contentForMatching, tag.toLowerCase())) {
          singleMatches++;
          keywords.push(tag);
        }
      }
    }
    
    const matchesDesc = w.description && contentForMatching.includes(w.description.toLowerCase().slice(0, 20));
    
    if (groupMatched || singleMatches >= 2 || matchesDesc) {
      if (!matchingOrders.some(x => x.name === w.name)) {
        matchingOrders.push(w);
        matchedKeywords.set(w.name, keywords);
      }
    }
  }

  const autoApply = matchingOrders
    .filter(w => w.automention === 'true')
    .map(w => w.name);
  
  const expandedApply = matchingOrders
    .filter(w => w.automention === 'expanded')
    .map(w => w.name);

  return { autoApply, expandedApply, matchedKeywords };
}


/**
 * Wraps matched trigger words in brackets for visual highlighting.
 * Adjacent keywords are merged into single brackets.
 * 
 * @example
 * highlightMatchedWords("5 approaches to solve", ["5", "approaches"])
 * // => "[5 approaches] to solve"
 * 
 * highlightMatchedWords("I have 5 different approaches", ["5", "approaches"])
 * // => "I have [5] different [approaches]"
 */
export function highlightMatchedWords(text: string, keywords: string[]): string {
  if (!keywords.length) return text;
  
  let result = text;
  for (const kw of keywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b(${escaped})\\b`, 'gi');
    result = result.replace(regex, '[$1]');
  }
  
  // Merge adjacent brackets: "][" or "] [" → " " (combine into one bracket)
  result = result.replace(/\]\s*\[/g, ' ');
  
  return result;
}


/**
 * Strips existing workflow hint blocks from text.
 * Handles both themes (Workflow/Orders) and corrupted/partial hints.
 * 
 * @example
 * stripExistingHints("hello\n\n[⚡ Workflow matched]\n↳ //[test]...")
 * // => "hello"
 */
export function stripExistingHints(text: string): string {
  const HINT_FINGERPRINTS = [
    /\[Important\. Workflow Detected\]/i,
    /\[Workflow Detected\]/i,
    /\[⚡/,
    /^ACTION_REQUIRED(?:_NOW)?:\s*IF/i,
    /↳\s*`\/\//,
    /↳\s*\[\/\//,
    /↳\s*\/\/\[/,
    /↳\s*Fetch:\s*[`"]/,
    /↳\s*Desc:\s*[`"]/,
    /\(matched:\s*[`"]/,
    /—\s*"/,
  ];

  return text
    .split('\n')
    .filter(line => !HINT_FINGERPRINTS.some(fp => fp.test(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strips highlight brackets [keyword] added by highlightMatchedWords().
 * Only removes single-word or adjacent-word brackets, not other bracket content.
 * 
 * @example
 * stripHighlightBrackets("[5 approaches] to solve")
 * // => "5 approaches to solve"
 */
export function stripHighlightBrackets(text: string): string {
  // Match brackets containing words (our highlight format)
  // Preserves brackets that are clearly not highlights (e.g., [use_workflow:...])
  return text.replace(/\[(\w+(?:\s+\w+)*)\]/g, '$1');
}

/**
 * Sanitizes user message by removing all plugin-added content.
 * Call this BEFORE any processing to ensure idempotent transforms.
 * 
 * @example
 * sanitizeUserMessage("[5 approaches] here\n\n[⚡ Workflow matched]...")
 * // => "5 approaches here"
 */
export function sanitizeUserMessage(text: string): string {
  let clean = stripExistingHints(text);
  clean = stripHighlightBrackets(clean);
  return clean.trim();
}

export function findSpawnOrders(
  orders: Order[],
  activeAgent: string
): SpawnMatchResult {
  const hints: string[] = [];
  const expanded: string[] = [];

  for (const w of orders) {
    for (const entry of w.spawnFor) {
      if (entry.agent === activeAgent) {
        if (entry.mode === 'expanded') {
          expanded.push(w.name);
        } else {
          hints.push(w.name);
        }
        break;
      }
    }
  }

  return { hints, expanded };
}

export function formatSuggestion(name: string, aliases: string[], maxAliases = 3): string {
  if (aliases.length === 0) return name;
  const topAliases = aliases.slice(0, maxAliases).join(' | ');
  return `${name} (${topAliases})`;
}

export function formatAutoApplyHint(
  orderNames: string[],
  orders: Map<string, Order>,
  matchedKeywords: Map<string, string[]>,
  theme: Theme = 'standard'
): string {
  const singular = orderNames.length === 1;
  const header = getMessage(singular ? 'ordersMatched' : 'ordersMatched', theme);

  const items = orderNames.map(name => {
    const w = orders.get(name);
    const desc = w?.description || 'No description';
    const triggers = matchedKeywords.get(name) || [];
    const triggerHint = triggers.length > 0 
      ? ` (matched: ${triggers.slice(0, 3).map(t => `\`${t}\``).join(', ')})`
      : '';
    return `↳ \`// ${name}\`${triggerHint}  —  "${desc}"`;
  });

  return `[${header}]
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`name\`), else SKIP
${items.join('\n')}`;
}

export function formatUserHint(
  orderNames: string[], 
  descriptions: Map<string, string>,
  theme: Theme = 'standard'
): string {
  const items = orderNames.map(name => {
    const desc = descriptions.get(name) || 'No description';
    return `// ${name} — "${desc}"`;
  });
  const label = getMessage('suggested', theme);
  return `[${label}: ${items.join('; ')}]`;
}


export function formatAutoApplyHintLegacy(orderNames: string[], descriptions: Map<string, string>): string {
  const items = orderNames.map(name => {
    const desc = descriptions.get(name) || 'No description';
    return `// ${name} — "${desc}"`;
  });
  return `[Auto-apply workflow (if relevant): ${items.join('; ')} — use get_workflow("name") to fetch or ignore if irrelevant]`;
}

export const findMatchingAutoScrolls = findMatchingAutoOrders;
export const findSpawnScrolls = findSpawnOrders;
