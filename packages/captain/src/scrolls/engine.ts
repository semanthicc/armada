import type { VariableResolver, CaptainConfig } from '../core/types';
import type { Scroll, ScrollRef, ScrollMention, ExpansionResult, Order, OrderRef, OrderMention } from './types';
import { findByName, findAllMatches } from '../core/matcher';
import { expandVariables } from '../core/variables';
import { shortId } from '../core/utils';
import { MarkdownAwareTokenizer } from '../tokenizer';

export interface NestedExpansionResult {
  content: string;
  nestedOrders: string[];
  hints: string[];
  warnings: string[];
  newRefs: Map<string, OrderRef>;
}

export function parseOrderArgs(argsString: string | undefined): Record<string, string> {
  if (!argsString) return {};

  const trimmed = argsString.trim();
  if (!trimmed) return {};

  const args: Record<string, string> = {};
  const argPattern = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;

  let hasNamedArgs = false;
  let match;
  while ((match = argPattern.exec(trimmed)) !== null) {
    hasNamedArgs = true;
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    args[key] = value;
  }

  if (!hasNamedArgs) {
    const quotedMatch = trimmed.match(/^["'](.*)["']$/);
    args._ = quotedMatch ? quotedMatch[1] : trimmed;
  }

  return args;
}

export function detectOrderMentions(text: string): OrderMention[] {
  return MarkdownAwareTokenizer.tokenize(text);
}

export const detectScrollMentions = detectOrderMentions;

export function extractOrderReferences(text: string): string[] {
  const refs = new Set<string>();
  
  const bracketedPattern = /\[use_workflow:\s*([\p{L}\p{N}_-]+)-[\p{L}\p{N}_-]+\]/gu;
  let match;
  while ((match = bracketedPattern.exec(text)) !== null) {
    refs.add(match[1]);
  }
  
  const unbracketedPattern = /(?<!\[)use_workflow:\s*([\p{L}\p{N}_-]+)-[\p{L}\p{N}_-]+/gu;
  while ((match = unbracketedPattern.exec(text)) !== null) {
    refs.add(match[1]);
  }
  
  const xmlPattern = /<workflow\s+name="([^"]+)"/g;
  while ((match = xmlPattern.exec(text)) !== null) {
    refs.add(match[1]);
  }
  
  return [...refs];
}

export function expandOrphanOrderRefs(
  text: string,
  orders: Map<string, Pick<Order, 'name' | 'content' | 'source'>>,
  contextVariables?: Record<string, VariableResolver>,
  idGenerator?: () => string
): { expanded: string; expandedRefs: string[] } {
  const useWorkflowPattern = /\[use_workflow:([\p{L}\p{N}_-]+)-[\p{L}\p{N}_-]+\]/gu;
  let expanded = text;
  const expandedRefs: string[] = [];
  
  let refMatch;
  while ((refMatch = useWorkflowPattern.exec(expanded)) !== null) {
    const refName = refMatch[1];
    const hasFullExpansion = expanded.includes(`<workflow name="${refName}"`);
    if (!hasFullExpansion) {
      const order = orders.get(refName);
      if (order) {
        const id = idGenerator ? idGenerator() : Math.random().toString(36).slice(2, 6);
        const expandedContent = expandVariables(order.content, contextVariables);
        const fullContent = `\n\n<workflow name="${refName}" id="${refName}-${id}" source="${order.source}">\n${expandedContent}\n</workflow>\n\n`;
        expanded = expanded.replace(refMatch[0], fullContent);
        expandedRefs.push(refName);
        useWorkflowPattern.lastIndex = 0;
      }
    }
  }
  
  return { expanded, expandedRefs };
}

export function expandNestedOrders(
  content: string,
  parentOrder: Order,
  orders: Map<string, Order>,
  existingRefs: Map<string, OrderRef>,
  messageID: string,
  contextVariables: Record<string, VariableResolver>,
  config: CaptainConfig,
  expansionChain: string[] = [],
  depth: number = 0
): NestedExpansionResult {
  const result: NestedExpansionResult = {
    content,
    nestedOrders: [],
    hints: [],
    warnings: [],
    newRefs: new Map()
  };

  if (parentOrder.scrollInScroll !== 'true' && parentOrder.scrollInScroll !== 'hints') {
    return result;
  }

  const nestedMentions = detectOrderMentions(content);
  if (nestedMentions.length === 0) {
    return result;
  }

  if (parentOrder.scrollInScroll === 'hints') {
    const nestedNames = nestedMentions
      .map(m => findByName(m.name, [...orders.keys()]))
      .filter((n): n is string => n !== null);
    if (nestedNames.length > 0) {
      result.hints.push(`[Nested orders in ${parentOrder.name}: //${nestedNames.join(', //')} - set orderInOrder: true to expand]`);
    }
    return result;
  }

  const allRefs = new Map([...existingRefs, ...result.newRefs]);
  let expanded = content;

  for (const { name, force, args } of nestedMentions) {
    const canonicalName = findByName(name, [...orders.keys()]);
    if (!canonicalName) continue;

    const nestedOrder = orders.get(canonicalName);
    if (!nestedOrder) continue;

    if (expansionChain.includes(canonicalName)) {
      result.warnings.push(`Circular reference detected: ${[...expansionChain, canonicalName].join(' → ')}`);
      continue;
    }

    if (depth >= config.maxNestingDepth) {
      result.warnings.push(`Max nesting depth (${config.maxNestingDepth}) reached at ${canonicalName}`);
      continue;
    }

    const existingRef = allRefs.get(canonicalName);
    if (existingRef && !force) {
      const mentionPattern = new RegExp(`(?<![:\\\\w/])//${name}!?(?![\\\\w-])`, 'g');
      expanded = expanded.replace(mentionPattern, `[use_workflow:${canonicalName}-${existingRef.id}]`);
      continue;
    }

    const id = shortId(messageID, canonicalName, expansionChain);
    const newRef: OrderRef = { id, messageID, implicit: false };
    result.newRefs.set(canonicalName, newRef);
    allRefs.set(canonicalName, newRef);
    result.nestedOrders.push(canonicalName);

    const argsAsResolvers: Record<string, VariableResolver> = {};
    for (const [key, value] of Object.entries(args)) {
      argsAsResolvers[`args.${key}`] = () => value;
    }
    let nestedContent = expandVariables(nestedOrder.content, { ...contextVariables, ...argsAsResolvers });

    const nestedResult = expandNestedOrders(
      nestedContent,
      nestedOrder,
      orders,
      allRefs,
      messageID,
      contextVariables,
      config,
      [...expansionChain, canonicalName],
      depth + 1
    );

    nestedContent = nestedResult.content;
    result.nestedOrders.push(...nestedResult.nestedOrders);
    result.hints.push(...nestedResult.hints);
    result.warnings.push(...nestedResult.warnings);
    for (const [k, v] of nestedResult.newRefs) {
      result.newRefs.set(k, v);
      allRefs.set(k, v);
    }

    const fullNestedContent = `\n\n<workflow name="${canonicalName}" id="${canonicalName}-${id}" source="${nestedOrder.source}">\n${nestedContent}\n</workflow>\n\n`;

    const mentionPattern = new RegExp(`(?<![:\\\\w/])//${name}!?(?![\\\\w-])`, 'g');
    expanded = expanded.replace(mentionPattern, fullNestedContent);
  }

  result.content = expanded;
  return result;
}

export function processMessageText(
  text: string,
  orders: Map<string, Order>,
  existingRefs: Map<string, OrderRef>,
  messageID: string,
  contextVariables: Record<string, VariableResolver>,
  config: CaptainConfig
): ExpansionResult {
  const mentions = detectOrderMentions(text);
  
  const result: ExpansionResult = {
    text,
    found: [],
    reused: [],
    notFound: [],
    suggestions: new Map(),
    hints: [],
    warnings: [],
    newRefs: new Map()
  };

  if (mentions.length === 0) {
    return result;
  }

  const allRefs = new Map([...existingRefs, ...result.newRefs]);
  const tokenMap = new Map<string, string>();
  let expanded = text;
  
  for (const { name, args } of mentions) {
    const token = `__WF_TOKEN_${name}_${Math.random().toString(36).slice(2)}__`;
    tokenMap.set(name, token);
    
    const mentionPatternStr = args && Object.keys(args).length > 0
      ? `(?<![:\\\\w/])//${name}\\([^)]*\\)!?(?![\\\\w-])`
      : `(?<![:\\\\w/])//${name}!?(?![\\\\w-])`;
    
    expanded = expanded.replace(new RegExp(mentionPatternStr, 'g'), token);
  }

  for (const { name, force, args } of mentions) {
    const token = tokenMap.get(name);
    if (!token) continue;

    const canonicalName = findByName(name, [...orders.keys()]);
    const order = canonicalName ? orders.get(canonicalName) : null;
    
    if (!order || !canonicalName) {
      result.notFound.push(name);
      const matches = findAllMatches(name, [...orders.keys()], 3);
      if (matches.length > 0) result.suggestions.set(name, matches);
      expanded = expanded.split(token).join(`//${name}`);
      continue;
    }

    const existingRef = allRefs.get(canonicalName);
    const shouldFullInject = force || !existingRef || existingRef.implicit;

    if (shouldFullInject) {
      const id = shortId(messageID, canonicalName, []);
      const newRef: OrderRef = { id, messageID, implicit: false };
      result.newRefs.set(canonicalName, newRef);
      allRefs.set(canonicalName, newRef);
      result.found.push(canonicalName);
      
      const shouldExpand = order.expand && config.expandOrders;
      
      if (shouldExpand) {
        const argsAsResolvers: Record<string, VariableResolver> = {};
        for (const [key, value] of Object.entries(args)) {
          argsAsResolvers[`args.${key}`] = () => value;
        }
        
        let expandedContent = expandVariables(order.content, { ...contextVariables, ...argsAsResolvers });
        
        const nestedResult = expandNestedOrders(
          expandedContent,
          order,
          orders,
          allRefs,
          messageID,
          contextVariables,
          config,
          [canonicalName],
          1
        );
        expandedContent = nestedResult.content;
        result.found.push(...nestedResult.nestedOrders);
        result.hints.push(...nestedResult.hints);
        result.warnings.push(...nestedResult.warnings);
        
        for (const [k, v] of nestedResult.newRefs) {
          result.newRefs.set(k, v);
          allRefs.set(k, v);
        }
        
        if (nestedResult.hints.length > 0) {
          expandedContent += '\n\n' + nestedResult.hints.join('\n');
        }
        
        const fullContent = `\n\n<workflow name="${canonicalName}" id="${canonicalName}-${id}" source="${order.source}">\n${expandedContent}\n</workflow>\n\n`;

        if (config.deduplicateSameMessage) {
          expanded = expanded.replace(token, fullContent);
          const beforeReplace = expanded;
          expanded = expanded.split(token).join(`[use_workflow:${canonicalName}-${id}]`);
          if (expanded !== beforeReplace && !result.reused.includes(canonicalName)) {
            result.reused.push(canonicalName);
          }
        } else {
          expanded = expanded.split(token).join(fullContent);
        }
      } else {
        const hintContent = `[//${canonicalName} → call get_workflow("${canonicalName}") to read]`;
        expanded = expanded.split(token).join(hintContent);
      }
    } else {
      result.reused.push(canonicalName);
      expanded = expanded.split(token).join(`[use_workflow:${canonicalName}-${existingRef!.id}]`);
    }
  }

  const useWorkflowPattern = /\[use_workflow:([\p{L}\p{N}_-]+)-[\p{L}\p{N}]+\]/gu;
  let refMatch;
  while ((refMatch = useWorkflowPattern.exec(expanded)) !== null) {
    const refName = refMatch[1];
    const hasFullExpansion = expanded.includes(`<workflow name="${refName}"`);
    if (!hasFullExpansion) {
      const existingRef = allRefs.get(refName);
      if (existingRef && existingRef.messageID !== messageID) {
        continue;
      }
      
      const order = orders.get(refName);
      if (order) {
        const shouldExpandOrphan = order.expand && config.expandOrders;
        if (!shouldExpandOrphan) {
          continue;
        }
        
        const id = shortId(messageID, refName, []);
        const newRef: OrderRef = { id, messageID, implicit: true };
        result.newRefs.set(refName, newRef);
        allRefs.set(refName, newRef);
        if (!result.found.includes(refName)) {
          result.found.push(refName);
        }
        const idx = result.reused.indexOf(refName);
        if (idx !== -1) {
          result.reused.splice(idx, 1);
        }
        
        const expandedContent = expandVariables(order.content, contextVariables);
        const fullContent = `\n\n<workflow name="${refName}" id="${refName}-${id}" source="${order.source}">\n${expandedContent}\n</workflow>\n\n`;
        expanded = expanded.replace(refMatch[0], fullContent);
        useWorkflowPattern.lastIndex = 0;
      }
    }
  }

  result.text = expanded;
  return result;
}

export function expandOrderMentions(
  text: string,
  orders: Map<string, Order>,
  config: CaptainConfig
): { expanded: string; found: string[]; notFound: string[]; suggestions: Map<string, string> } {
  const mentions = detectOrderMentions(text);
  const found: string[] = [];
  const notFound: string[] = [];
  const suggestions = new Map<string, string>();
  let expanded = text;

  for (const { name, args } of mentions) {
    const order = orders.get(name);
    if (order) {
      found.push(name);
      
      const mentionPatternStr = args && Object.keys(args).length > 0
        ? `(?<![:\\\\w/])//${name}\\([^)]*\\)!?(?![\\\\w-])`
        : `(?<![:\\\\w/])//${name}!?(?![\\\\w-])`;

      const fullContent = `\n\n<workflow name="${name}" source="${order.source}">\n${order.content}\n</workflow>\n\n`;

      if (config.deduplicateSameMessage) {
        const firstPattern = new RegExp(mentionPatternStr);
        expanded = expanded.replace(firstPattern, fullContent);

        const remainingPattern = new RegExp(mentionPatternStr, 'g');
        expanded = expanded.replace(remainingPattern, `[use_workflow:${name}]`);
      } else {
        const globalPattern = new RegExp(mentionPatternStr, 'g');
        expanded = expanded.replace(globalPattern, fullContent);
      }
    } else {
      notFound.push(name);
      const match = findAllMatches(name, [...orders.keys()], 1)[0];
      if (match) {
        suggestions.set(name, match);
      }
    }
  }

  return { expanded, found, notFound, suggestions };
}
