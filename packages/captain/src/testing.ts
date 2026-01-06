/**
 * Test helpers for opencode-captain plugin.
 * 
 * IMPORTANT: These are NOT exported from the main index.ts to avoid
 * breaking OpenCode's plugin loader which iterates all exports and
 * calls them as plugin functions.
 * 
 * Import from './testing' in tests, not from './index'.
 */

import { findByName, findBestMatch, expandVariables, shortId } from './core';
import type { VariableResolver } from './core';
import { detectScrollMentions } from './scrolls';
import type { ScrollInScrollMode, AutomentionMode, SpawnForEntry, Scroll, Order, SpawnAtEntry, OrderInOrderMode } from './scrolls';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type { VariableResolver } from './core';

const detectWorkflowMentions = detectScrollMentions;
const findWorkflowByName = findByName;
type WorkflowInWorkflowMode = ScrollInScrollMode;

export function createMockOrder(partial: Partial<Order> & { name: string }): Order {
  return {
    promptType: 'scroll',
    aliases: [],
    tags: [],
    onlyFor: [],
    spawnFor: [],
    description: '',
    automention: 'true',
    scrollInScroll: 'false',
    expand: true,
    include: [],
    includeWarnings: [],
    content: '',
    source: 'global',
    path: `/mock/${partial.name}.md`,
    onLoad: [],
    ...partial,
  };
}

export interface WorkflowInfo {
  name: string;
  aliases: string[];
  tags: (string | string[])[];
  onlyFor: string[];
  spawnAt: SpawnAtEntry[];
  description: string;
  automention: AutomentionMode;
  workflowInWorkflow: WorkflowInWorkflowMode;
  content: string;
  source: 'project' | 'global';
  path: string;
  folder?: string;
}

export interface WorkflowConfig {
  deduplicateSameMessage: boolean;
  maxNestingDepth: number;
}

export interface ProcessMentionsResult {
  expanded: string;
  found: string[];
  reused: string[];
  notFound: string[];
}

const testSessionWorkflows = new Map<string, Map<string, { id: string; messageID: string; implicit?: boolean }>>();

// shortId is now imported from engine.ts

export function clearSessionWorkflows(sessionID?: string): void {
  if (sessionID) {
    testSessionWorkflows.delete(sessionID);
  } else {
    testSessionWorkflows.clear();
  }
}

export function getSessionWorkflows(sessionID: string): Map<string, { id: string; messageID: string; implicit?: boolean }> | undefined {
  return testSessionWorkflows.get(sessionID);
}

export function setSessionWorkflowRef(
  sessionID: string,
  workflowName: string,
  ref: { id: string; messageID: string; implicit?: boolean }
): void {
  if (!testSessionWorkflows.has(sessionID)) {
    testSessionWorkflows.set(sessionID, new Map());
  }
  testSessionWorkflows.get(sessionID)!.set(workflowName, ref);
}

export function processWorkflowMentionsForSession(
  text: string,
  sessionID: string,
  messageID: string,
  workflowsMap: Map<string, WorkflowInfo>,
  config: WorkflowConfig,
  contextVariables: Record<string, VariableResolver> = {}
): ProcessMentionsResult {
  if (!testSessionWorkflows.has(sessionID)) {
    testSessionWorkflows.set(sessionID, new Map());
  }
  const workflowRefs = testSessionWorkflows.get(sessionID)!;

  const mentions = detectWorkflowMentions(text);
  const found: string[] = [];
  const reused: string[] = [];
  const notFound: string[] = [];
  let expanded = text;

  const tokenMap = new Map<string, string>();
  
  for (const { name, args } of mentions) {
    const token = `__OP_WF_TOKEN_${name}_${Math.random().toString(36).slice(2)}__`;
    tokenMap.set(name, token);
    
    const mentionPatternStr = args && Object.keys(args).length > 0
      ? `(?<![:\\\\w/])//${name}\\([^)]*\\)!?(?![\\\\w-])`
      : `(?<![:\\\\w/])//${name}!?(?![\\\\w-])`;
    
    expanded = expanded.replace(new RegExp(mentionPatternStr, 'g'), token);
  }

  for (const { name, force, args } of mentions) {
    const token = tokenMap.get(name);
    if (!token) continue;

    const canonicalName = findWorkflowByName(name, [...workflowsMap.keys()]);
    const workflow = canonicalName ? workflowsMap.get(canonicalName) : null;

    if (!workflow || !canonicalName) {
      notFound.push(name);
      expanded = expanded.split(token).join(`//${name}`);
      continue;
    }

    const existingRef = workflowRefs.get(canonicalName);
    const shouldFullInject = force || !existingRef || existingRef.implicit;

    if (shouldFullInject) {
      const id = shortId(messageID, canonicalName, []);
      workflowRefs.set(canonicalName, { id, messageID, implicit: false });
      found.push(canonicalName);

      const argsAsResolvers: Record<string, VariableResolver> = {};
      for (const [key, value] of Object.entries(args)) {
        argsAsResolvers[`args.${key}`] = () => value;
      }

      const expandedContent = expandVariables(workflow.content, { ...contextVariables, ...argsAsResolvers });

      const fullContent = `\n\n<workflow name="${canonicalName}" id="${canonicalName}-${id}" source="${workflow.source}">\n${expandedContent}\n</workflow>\n\n`;

      if (config.deduplicateSameMessage) {
        expanded = expanded.replace(token, fullContent);

        const beforeReplace = expanded;
        expanded = expanded.split(token).join(`[use_workflow:${canonicalName}-${id}]`);
        if (expanded !== beforeReplace && !reused.includes(canonicalName)) {
          reused.push(canonicalName);
        }
      } else {
        expanded = expanded.split(token).join(fullContent);
      }
    } else {
      reused.push(canonicalName);
      expanded = expanded.split(token).join(`[use_workflow:${canonicalName}-${existingRef.id}]`);
    }
  }

  const useWorkflowPattern = /\[use_workflow:([\p{L}\p{N}_-]+)-[a-z0-9]+\]/gu;
  let refMatch;
  while ((refMatch = useWorkflowPattern.exec(expanded)) !== null) {
    const refName = refMatch[1];
    const hasFullExpansion = expanded.includes(`<workflow name="${refName}"`);
    if (!hasFullExpansion) {
      const existingRef = workflowRefs.get(refName);
      if (existingRef && existingRef.messageID !== messageID) {
        continue;
      }
      
      const workflow = workflowsMap.get(refName);
      if (workflow) {
        const id = shortId(messageID, refName, []);
        workflowRefs.set(refName, { id, messageID, implicit: true });
        if (!found.includes(refName)) {
          found.push(refName);
        }
        const idx = reused.indexOf(refName);
        if (idx !== -1) {
          reused.splice(idx, 1);
        }

        const expandedContent = expandVariables(workflow.content, contextVariables);
        const fullContent = `\n\n<workflow name="${refName}" id="${refName}-${id}" source="${workflow.source}">\n${expandedContent}\n</workflow>\n\n`;
        expanded = expanded.replace(refMatch[0], fullContent);
        useWorkflowPattern.lastIndex = 0;
      }
    }
  }

  return { expanded, found, reused, notFound };
}

export function loadConfig(): WorkflowConfig {
  const configDir = join(homedir(), '.config', 'opencode');
  const configPath = join(configDir, 'workflows.json');
  
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (!existsSync(configPath)) {
      const defaultConfig: WorkflowConfig = { deduplicateSameMessage: true, maxNestingDepth: 3 };
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      return defaultConfig;
    }

    const content = readFileSync(configPath, 'utf-8');
    const json = JSON.parse(content);
    return {
      deduplicateSameMessage: json.deduplicateSameMessage ?? true,
      maxNestingDepth: json.maxNestingDepth ?? 3
    };
  } catch (err) {
    console.error(`[workflows] Failed to load config: ${err instanceof Error ? err.message : err}`);
  }
  return { deduplicateSameMessage: true, maxNestingDepth: 3 };
}

export function expandWorkflowMentions(
  text: string,
  workflows: Map<string, WorkflowInfo>,
  config: WorkflowConfig
): { expanded: string; found: string[]; notFound: string[]; suggestions: Map<string, string> } {
  const mentions = detectWorkflowMentions(text);
  const found: string[] = [];
  const notFound: string[] = [];
  const suggestions = new Map<string, string>();
  let expanded = text;

  const tokenMap = new Map<string, string>();
  
  for (const { name, args } of mentions) {
    const token = `__OP_WF_TOKEN_${name}_${Math.random().toString(36).slice(2)}__`;
    tokenMap.set(name, token);
    
    const mentionPatternStr = args && Object.keys(args).length > 0
      ? `(?<![:\\\\w/])//${name}\\([^)]*\\)!?(?![\\\\w-])`
      : `(?<![:\\\\w/])//${name}!?(?![\\\\w-])`;
    
    expanded = expanded.replace(new RegExp(mentionPatternStr, 'g'), token);
  }

  for (const { name, args } of mentions) {
    const token = tokenMap.get(name);
    if (!token) continue;

    const workflow = workflows.get(name);
    if (workflow) {
      found.push(name);

      const fullContent = `\n\n<workflow name="${name}" source="${workflow.source}">\n${workflow.content}\n</workflow>\n\n`;

      if (config.deduplicateSameMessage) {
        expanded = expanded.replace(token, fullContent);
        expanded = expanded.split(token).join(`[use_workflow:${name}]`);
      } else {
        expanded = expanded.split(token).join(fullContent);
      }
    } else {
      notFound.push(name);
      const match = findBestMatch(name, [...workflows.keys()]);
      if (match) {
        suggestions.set(name, match);
      }
      expanded = expanded.split(token).join(`//${name}`);
    }
  }

  return { expanded, found, notFound, suggestions };
}


export interface TextPart {
  type: "text";
  text: string;
}

export interface MultiPartResult {
  parts: TextPart[];
  hasGlobalMentions: boolean;
}

export function processMultiPartMessage(
  parts: TextPart[],
  sessionID: string,
  messageID: string,
  workflowsMap: Map<string, WorkflowInfo>,
  config: WorkflowConfig,
  activeAgent: string = 'default'
): MultiPartResult {
  if (!testSessionWorkflows.has(sessionID)) {
    testSessionWorkflows.set(sessionID, new Map());
  }

  const hasGlobalMentions = parts.some(
    p => p.type === "text" && detectWorkflowMentions(p.text).length > 0
  );

  const resultParts: TextPart[] = [];

  for (const part of parts) {
    const mentions = detectWorkflowMentions(part.text);
    let processedText = part.text;

    if (mentions.length === 0 && !hasGlobalMentions) {
      const userContent = part.text.toLowerCase();
      
      const matchingWorkflows = [...workflowsMap.values()]
        .filter(w => w.automention !== 'false')
        .filter(w => w.onlyFor.length === 0 || w.onlyFor.includes(activeAgent))
        .filter(w => {
          const matchesTag = w.tags.some(t => {
            if (typeof t === 'string') {
              return userContent.includes(t.toLowerCase());
            }
            return false;
          });
          const matchesDesc = w.description && userContent.includes(w.description.toLowerCase().slice(0, 20));
          return matchesTag || matchesDesc;
        });

      const autoApply = matchingWorkflows
        .filter(w => w.automention === 'true')
        .map(w => `//${w.name} — "${w.description || 'No description'}"`);

      if (autoApply.length > 0) {
        processedText += `\n\n[Auto-apply workflow (if relevant): ${autoApply.join('; ')} — use get_workflow("name") to fetch or ignore if irrelevant]`;
      }
    } else if (mentions.length > 0) {
      const result = processWorkflowMentionsForSession(
        part.text,
        sessionID,
        messageID,
        workflowsMap,
        config
      );
      processedText = result.expanded;
    }

    resultParts.push({ type: "text", text: processedText });
  }

  return { parts: resultParts, hasGlobalMentions };
}
