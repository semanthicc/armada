import type { VariableResolver, CaptainConfig, Theme } from '../core/types';
import type { Order, OrderRef } from './types';
import { processMessageText, detectOrderMentions } from './engine';
import { 
  findMatchingAutoOrders, 
  findSpawnOrders, 
  formatAutoApplyHint,
  formatUserHint 
} from './automention';

export interface SessionState {
  orderRefs: Map<string, OrderRef>;
  lastMessageID: string | null;
}

export function createSessionState(): SessionState {
  return {
    orderRefs: new Map(),
    lastMessageID: null,
  };
}

export interface MessageProcessingContext {
  orders: Map<string, Order>;
  config: CaptainConfig;
  theme: Theme;
  sessionState: SessionState;
  messageID: string;
  activeAgent?: string;
  contextVariables?: Record<string, VariableResolver>;
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
  
  const mentions = detectOrderMentions(text);
  
  if (mentions.length > 0) {
    const result = processMessageText(
      text,
      ctx.orders,
      ctx.sessionState.orderRefs,
      ctx.messageID,
      contextVars,
      ctx.config
    );
    
    for (const [name, ref] of result.newRefs) {
      ctx.sessionState.orderRefs.set(name, ref);
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
  
  const ordersArray = [...ctx.orders.values()].filter((v, i, arr) => 
    arr.findIndex(x => x.name === v.name) === i
  );
  
  const explicitlyMentioned = [...ctx.sessionState.orderRefs.keys()];
  const autoResult = findMatchingAutoOrders(text, ordersArray, ctx.activeAgent, explicitlyMentioned);
  
  let autoApplyHint: string | undefined;
  let userHint: string | undefined;
  
  if (autoResult.expandedApply.length > 0) {
    let expandedText = text;
    for (const name of autoResult.expandedApply) {
      expandedText += `\n\n//${name}`;
    }
    
    const result = processMessageText(
      expandedText,
      ctx.orders,
      ctx.sessionState.orderRefs,
      ctx.messageID,
      contextVars,
      ctx.config
    );
    
    for (const [name, ref] of result.newRefs) {
      ctx.sessionState.orderRefs.set(name, ref);
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
      ctx.orders,
      autoResult.matchedKeywords,
      ctx.theme
    );
  }
  
  const spawnResult = findSpawnOrders(ordersArray, ctx.activeAgent || '');
  
  if (spawnResult.expanded.length > 0) {
    let expandedText = text;
    for (const name of spawnResult.expanded) {
      if (!ctx.sessionState.orderRefs.has(name)) {
        expandedText += `\n\n//${name}`;
      }
    }
    
    if (expandedText !== text) {
      const result = processMessageText(
        expandedText,
        ctx.orders,
        ctx.sessionState.orderRefs,
        ctx.messageID,
        contextVars,
        ctx.config
      );
      
      for (const [name, ref] of result.newRefs) {
        ctx.sessionState.orderRefs.set(name, ref);
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
      const order = ctx.orders.get(name);
      if (order) descriptions.set(name, order.description);
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
  state.orderRefs.clear();
  state.lastMessageID = null;
}

export function getSessionOrderRefs(state: SessionState): Map<string, OrderRef> {
  return new Map(state.orderRefs);
}
