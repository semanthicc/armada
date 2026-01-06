import type { VariableResolver, CaptainConfig, Theme } from '../core/types';
import type { Scroll, ScrollRef, Order, OrderRef } from './types';
import { processMessageText, detectScrollMentions } from './engine';
import { 
  findMatchingAutoScrolls, 
  findSpawnScrolls, 
  formatAutoApplyHint,
  formatUserHint 
} from './automention';

export interface SessionState {
  scrollRefs: Map<string, ScrollRef>;
  lastMessageID: string | null;
  /** @deprecated Use scrollRefs instead */
  get orderRefs(): Map<string, OrderRef>;
}

function createSessionStateImpl(): SessionState {
  const scrollRefs = new Map<string, ScrollRef>();
  return {
    scrollRefs,
    lastMessageID: null,
    get orderRefs() { return scrollRefs; }
  };
}

export function createSessionState(): SessionState {
  return createSessionStateImpl();
}

export interface MessageProcessingContext {
  scrolls: Map<string, Scroll>;
  config: CaptainConfig;
  theme: Theme;
  sessionState: SessionState;
  messageID: string;
  activeAgent?: string;
  contextVariables?: Record<string, VariableResolver>;
  /** @deprecated Use scrolls instead */
  orders?: Map<string, Order>;
}

export interface ProcessedMessage {
  text: string;
  found: string[];
  reused: string[];
  notFound: string[];
  suggestions: Map<string, string[]>;
  hints: string[];
  warnings: string[];
  autoApplyHint?: string;
  userHint?: string;
}

export function processUserMessage(
  text: string,
  ctx: MessageProcessingContext
): ProcessedMessage {
  const contextVars = ctx.contextVariables || {};
  const scrolls = ctx.scrolls || ctx.orders || new Map();
  
  const mentions = detectScrollMentions(text);
  
  if (mentions.length > 0) {
    const result = processMessageText(
      text,
      scrolls,
      ctx.sessionState.scrollRefs,
      ctx.messageID,
      contextVars,
      ctx.config
    );
    
    for (const [name, ref] of result.newRefs) {
      ctx.sessionState.scrollRefs.set(name, ref);
    }
    ctx.sessionState.lastMessageID = ctx.messageID;
    
    return {
      text: result.text,
      found: result.found,
      reused: result.reused,
      notFound: result.notFound,
      suggestions: result.suggestions,
      hints: result.hints,
      warnings: result.warnings,
    };
  }
  
  const scrollsArray = [...scrolls.values()].filter((v, i, arr) => 
    arr.findIndex(x => x.name === v.name) === i
  );
  
  const explicitlyMentioned = [...ctx.sessionState.scrollRefs.keys()];
  const autoResult = findMatchingAutoScrolls(text, scrollsArray, ctx.activeAgent, explicitlyMentioned);
  
  let autoApplyHint: string | undefined;
  let userHint: string | undefined;
  
  if (autoResult.expandedApply.length > 0) {
    let expandedText = text;
    for (const name of autoResult.expandedApply) {
      expandedText += `\n\n//${name}`;
    }
    
    const result = processMessageText(
      expandedText,
      scrolls,
      ctx.sessionState.scrollRefs,
      ctx.messageID,
      contextVars,
      ctx.config
    );
    
    for (const [name, ref] of result.newRefs) {
      ctx.sessionState.scrollRefs.set(name, ref);
    }
    
    return {
      text: result.text,
      found: result.found,
      reused: result.reused,
      notFound: result.notFound,
      suggestions: result.suggestions,
      hints: result.hints,
      warnings: result.warnings,
    };
  }
  
  if (autoResult.autoApply.length > 0) {
    autoApplyHint = formatAutoApplyHint(
      autoResult.autoApply,
      scrolls,
      autoResult.matchedKeywords,
      ctx.theme
    );
  }
  
  const spawnResult = findSpawnScrolls(scrollsArray, ctx.activeAgent || '');
  
  if (spawnResult.expanded.length > 0) {
    let expandedText = text;
    for (const name of spawnResult.expanded) {
      if (!ctx.sessionState.scrollRefs.has(name)) {
        expandedText += `\n\n//${name}`;
      }
    }
    
    if (expandedText !== text) {
      const result = processMessageText(
        expandedText,
        scrolls,
        ctx.sessionState.scrollRefs,
        ctx.messageID,
        contextVars,
        ctx.config
      );
      
      for (const [name, ref] of result.newRefs) {
        ctx.sessionState.scrollRefs.set(name, ref);
      }
      
      return {
        text: result.text,
        found: result.found,
        reused: result.reused,
        notFound: result.notFound,
        suggestions: result.suggestions,
        hints: result.hints,
        warnings: result.warnings,
        autoApplyHint,
      };
    }
  }
  
  if (spawnResult.hints.length > 0) {
    const descriptions = new Map<string, string>();
    for (const name of spawnResult.hints) {
      const scroll = scrolls.get(name);
      if (scroll) descriptions.set(name, scroll.description);
    }
    userHint = formatUserHint(spawnResult.hints, descriptions, ctx.theme);
  }
  
  return {
    text,
    found: [],
    reused: [],
    notFound: [],
    suggestions: new Map(),
    hints: [],
    warnings: [],
    autoApplyHint,
    userHint,
  };
}

export function clearSessionState(state: SessionState): void {
  state.scrollRefs.clear();
  state.lastMessageID = null;
}

export function getSessionScrollRefs(state: SessionState): Map<string, ScrollRef> {
  return new Map(state.scrollRefs);
}

/** @deprecated Use getSessionScrollRefs instead */
export const getSessionOrderRefs = getSessionScrollRefs;
