import type { TagOrGroup, Theme } from '../core/types';
import type { Order } from './types';
import { isOrGroup, matchesTagItem } from '../core/matcher';
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
  
  if (/\/\/\s+[\w-]/.test(userContent)) {
    return { autoApply: [], expandedApply: [], matchedKeywords };
  }

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
      if (Array.isArray(tag)) {
        const groupKeywords: string[] = [];
        const allInGroup = tag.every(t => {
          const matched = matchesTagItem(t, contentForMatching);
          if (matched) {
            const keyword = typeof t === 'string' ? t : (t as TagOrGroup).or.find(o => contentForMatching.includes(o.toLowerCase())) || '';
            if (keyword) groupKeywords.push(keyword);
          }
          return matched;
        });
        if (allInGroup && tag.length > 0) {
          groupMatched = true;
          keywords.push(...groupKeywords);
        }
      } else if (isOrGroup(tag)) {
        const matched = tag.or.find(t => contentForMatching.includes(t.toLowerCase()));
        if (matched) {
          singleMatches++;
          keywords.push(matched);
        }
      } else if (typeof tag === 'string') {
        if (tag.includes('|')) {
          const parts = tag.split('|').map(s => s.trim());
          const matched = parts.find(part => contentForMatching.includes(part.toLowerCase()));
          if (matched) {
            singleMatches++;
            keywords.push(matched);
          }
        } else if (contentForMatching.includes(tag.toLowerCase())) {
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

export function findSpawnOrders(
  orders: Order[],
  activeAgent: string
): SpawnMatchResult {
  const hints: string[] = [];
  const expanded: string[] = [];

  for (const w of orders) {
    for (const entry of w.spawnAt) {
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
      ? ` (matched: ${triggers.slice(0, 3).map(t => `"${t}"`).join(', ')})`
      : '';
    return `↳ // ${name}${triggerHint}\n↳ Desc: "${desc}"`;
  });

  return `[${header}
ACTION_REQUIRED: IF matches user intent → get_workflow("name"), else SKIP
${items.join('\n\n')}]`;
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
