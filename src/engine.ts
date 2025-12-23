import type { 
  TagOrGroup, 
  TagEntry, 
  AutoworkflowMode, 
  WorkflowInWorkflowMode, 
  ParsedFrontmatter,
  VariableResolver,
  AutoWorkflowMatchResult,
  Workflow,
  WorkflowConfig,
  WorkflowRef,
  NestedExpansionResult,
  ExpansionResult
} from './types';

export type { TagOrGroup, TagEntry, AutoworkflowMode, WorkflowInWorkflowMode, ParsedFrontmatter, VariableResolver, AutoWorkflowMatchResult };

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, '');
}

export function findWorkflowByName(input: string, candidates: string[]): string | null {
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

export interface WorkflowMention {
  name: string;
  force: boolean;
  args: Record<string, string>;
}

const WORKFLOW_MENTION_PATTERN = /(?<![:\w/])\/\/([\p{L}\p{N}][\p{L}\p{N}_-]*)(?:\(([^)]*)\))?(!)?/gu;

export function parseWorkflowArgs(argsString: string | undefined): Record<string, string> {
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

export function detectWorkflowMentions(text: string): WorkflowMention[] {
  const matches: WorkflowMention[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  
  WORKFLOW_MENTION_PATTERN.lastIndex = 0;

  while ((match = WORKFLOW_MENTION_PATTERN.exec(text)) !== null) {
    const name = match[1];
    const argsString = match[2];
    const force = match[3] === '!';
    
    if (!seen.has(name)) {
      seen.add(name);
      matches.push({ name, force, args: parseWorkflowArgs(argsString) });
    }
  }
  
  return matches;
}

export function parseArrayField(yaml: string, fieldName: string): string[] {
  const regex = new RegExp(`^${fieldName}:\\s*(?:\\[(.*)\\]|(.*))`, 'm');
  const match = yaml.match(regex);
  if (!match) return [];
  const raw = match[1] || match[2];
  if (!raw) return [];
  return raw.split(',').map(a => a.trim().replace(/['"]/g, '')).filter(a => a);
}

export function isOrGroup(entry: TagEntry): entry is TagOrGroup {
  return typeof entry === 'object' && !Array.isArray(entry) && 'or' in entry;
}

export function parseTagsField(yaml: string): TagEntry[] {
  const regex = /^tags:\s*\[([\s\S]*?)\]\s*$/m;
  const match = yaml.match(regex);
  if (!match) return [];
  
  const content = match[1].trim();
  if (!content) return [];
  
  const result: TagEntry[] = [];
  let depth = 0;
  let current = '';
  let inGroup = false;
  let groupItems: (string | TagOrGroup)[] = [];
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (char === '[') {
      depth++;
      if (depth === 1) {
        inGroup = true;
        groupItems = [];
        continue;
      }
    } else if (char === ']') {
      depth--;
      if (depth === 0 && inGroup) {
        if (current.trim()) {
          const trimmed = current.trim().replace(/['"]/g, '');
          if (trimmed.includes('|')) {
            groupItems.push({ or: trimmed.split('|').map(s => s.trim()).filter(s => s) });
          } else {
            groupItems.push(trimmed);
          }
        }
        if (groupItems.length > 0) {
          result.push(groupItems);
        }
        current = '';
        inGroup = false;
        continue;
      }
    } else if (char === ',' && depth === 0) {
      const trimmed = current.trim().replace(/['"]/g, '');
      if (trimmed) {
        if (trimmed.includes('|')) {
          result.push({ or: trimmed.split('|').map(s => s.trim()).filter(s => s) });
        } else {
          result.push(trimmed);
        }
      }
      current = '';
      continue;
    } else if (char === ',' && depth === 1 && inGroup) {
      const trimmed = current.trim().replace(/['"]/g, '');
      if (trimmed) {
        if (trimmed.includes('|')) {
          groupItems.push({ or: trimmed.split('|').map(s => s.trim()).filter(s => s) });
        } else {
          groupItems.push(trimmed);
        }
      }
      current = '';
      continue;
    }
    
    current += char;
  }
  
  const trimmed = current.trim().replace(/['"]/g, '');
  if (trimmed && !inGroup) {
    if (trimmed.includes('|')) {
      result.push({ or: trimmed.split('|').map(s => s.trim()).filter(s => s) });
    } else {
      result.push(trimmed);
    }
  }
  
  return result;
}

export function parseFrontmatter(fileContent: string): ParsedFrontmatter {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    return { aliases: [], tags: [], agents: [], description: '', autoworkflow: 'false', workflowInWorkflow: 'false', body: fileContent };
  }

  const yaml = match[1];
  const body = fileContent.slice(match[0].length);

  const aliases = [
    ...parseArrayField(yaml, 'aliases'),
    ...parseArrayField(yaml, 'shortcuts')
  ];
  const tags = parseTagsField(yaml);
  const agents = parseArrayField(yaml, 'agents');

  const descMatch = yaml.match(/^description:\s*(.*)$/m);
  const description = descMatch ? descMatch[1].trim().replace(/^['"]|['"]$/g, '') : '';

  const autoMatch = yaml.match(/^autoworkflow:\s*(.*)$/m);
  let autoworkflow: AutoworkflowMode = 'false';
  if (autoMatch) {
    const val = autoMatch[1].trim().toLowerCase();
    if (val === 'true' || val === 'yes') {
      autoworkflow = 'true';
    } else if (val === 'hintforuser' || val === 'hint') {
      autoworkflow = 'hintForUser';
    }
  }

  const wiwMatch = yaml.match(/^workflowInWorkflow:\s*(.*)$/m);
  let workflowInWorkflow: WorkflowInWorkflowMode = 'false';
  if (wiwMatch) {
    const val = wiwMatch[1].trim().toLowerCase();
    if (val === 'true' || val === 'yes') {
      workflowInWorkflow = 'true';
    } else if (val === 'hints' || val === 'hint') {
      workflowInWorkflow = 'hints';
    }
  }

  return { aliases, tags, agents, description, autoworkflow, workflowInWorkflow, body };
}

export function formatSuggestion(name: string, aliases: string[], maxAliases = 3): string {
  if (aliases.length === 0) return name;
  const topAliases = aliases.slice(0, maxAliases).join(' | ');
  return `${name} (${topAliases})`;
}

export const BUILTIN_VARIABLES: Record<string, VariableResolver> = {
  TODAY: () => new Date().toISOString().split('T')[0],
  NOW: () => new Date().toISOString().replace('T', ' ').split('.')[0],
};

export function expandVariables(
  content: string,
  extraVars?: Record<string, VariableResolver>
): string {
  const allVars = { ...BUILTIN_VARIABLES, ...extraVars };

  return content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const resolver = allVars[name];
    if (!resolver) return match;
    try {
      return resolver();
    } catch {
      return match;
    }
  });
}

export function expandOrphanWorkflowRefs(
  text: string,
  workflows: Map<string, Pick<Workflow, 'name' | 'content' | 'source'>>,
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
      const workflow = workflows.get(refName);
      if (workflow) {
        const id = idGenerator ? idGenerator() : Math.random().toString(36).slice(2, 6);
        const expandedContent = expandVariables(workflow.content, contextVariables);
        const fullContent = `\n\n<workflow name="${refName}" id="${refName}-${id}" source="${workflow.source}">\n${expandedContent}\n</workflow>\n\n`;
        expanded = expanded.replace(refMatch[0], fullContent);
        expandedRefs.push(refName);
        useWorkflowPattern.lastIndex = 0;
      }
    }
  }
  
  return { expanded, expandedRefs };
}

function matchesTagItem(item: string | TagOrGroup, lowerContent: string): boolean {
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

export function findMatchingAutoWorkflows(
  userContent: string,
  workflows: Workflow[],
  activeAgent?: string,
  explicitlyMentioned: string[] = []
): AutoWorkflowMatchResult {
  if (/\/\/\s+[\w-]/.test(userContent)) {
    return { autoApply: [], userHints: [] };
  }

  const detectedRefs = extractWorkflowReferences(userContent);
  const allExplicit = new Set([
    ...explicitlyMentioned.map(n => n.toLowerCase()),
    ...detectedRefs.map(n => n.toLowerCase())
  ]);

  const contentForMatching = userContent
    .replace(/\[use_workflow:[^\]]+\]/g, '')
    .replace(/<workflow[^>]*>[\s\S]*?<\/workflow>/g, '')
    .replace(/use_workflow:\S+/g, '')
    .toLowerCase();

  const matchingWorkflows = workflows
    .filter(w => w.autoworkflow === 'true' || w.autoworkflow === 'hintForUser')
    .filter(w => w.agents.length === 0 || (activeAgent && w.agents.includes(activeAgent)))
    .filter(w => {
      if (allExplicit.has(w.name.toLowerCase())) return false;
      if (w.aliases.some(a => allExplicit.has(a.toLowerCase()))) return false;

      let singleMatches = 0;
      let groupMatched = false;
      
      for (const tag of w.tags) {
        if (Array.isArray(tag)) {
          const allInGroup = tag.every(t => matchesTagItem(t, contentForMatching));
          if (allInGroup && tag.length > 0) {
            groupMatched = true;
          }
        } else if (isOrGroup(tag)) {
          if (tag.or.some(t => contentForMatching.includes(t.toLowerCase()))) {
            singleMatches++;
          }
        } else if (typeof tag === 'string') {
          if (tag.includes('|')) {
            const parts = tag.split('|').map(s => s.trim().toLowerCase());
            if (parts.some(part => contentForMatching.includes(part))) {
              singleMatches++;
            }
          } else if (contentForMatching.includes(tag.toLowerCase())) {
            singleMatches++;
          }
        }
      }
      
      const matchesDesc = w.description && contentForMatching.includes(w.description.toLowerCase().slice(0, 20));
      
      return groupMatched || singleMatches >= 2 || matchesDesc;
    })
    .filter((w, idx, arr) => arr.findIndex(x => x.name === w.name) === idx);

  const autoApply = matchingWorkflows
    .filter(w => w.autoworkflow === 'true')
    .map(w => w.name);
  
  const userHints = matchingWorkflows
    .filter(w => w.autoworkflow === 'hintForUser')
    .map(w => w.name);

  return { autoApply, userHints };
}

export function extractWorkflowReferences(text: string): string[] {
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

export function shortId(messageID: string, salt: string = '', expansionChain: string[] = []): string {
  // Combine all context into a single string for hashing
  // This guarantees uniqueness: same workflow at different depths = different ID
  const chainKey = expansionChain.join('/');
  const input = `${messageID}:${salt}:${chainKey}`;
  
  // djb2 hash - simple, fast, handles unicode via charCodeAt
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  
  // Convert to base36 for compact alphanumeric representation
  return hash.toString(36);
}

export function formatAutoApplyHint(workflowNames: string[], descriptions: Map<string, string>): string {
  const items = workflowNames.map(name => {
    const desc = descriptions.get(name) || 'No description';
    return `//\u200B${name} — "${desc}"`;
  });
  return `[Auto-apply workflow (if relevant): ${items.join('; ')} — use get_workflow("name") to fetch or ignore if irrelevant]`;
}

export function formatUserHint(workflowNames: string[], descriptions: Map<string, string>): string {
  const items = workflowNames.map(name => {
    const desc = descriptions.get(name) || 'No description';
    return `//\u200B${name} — "${desc}"`;
  });
  return `[Suggested workflows: ${items.join('; ')}]`;
}


/**
 * Recursively expands nested workflow mentions inside a parent workflow's content.
 * Pure function: returns new refs to be merged by caller instead of mutating.
 */
export function expandNestedWorkflows(
  content: string,
  parentWorkflow: Workflow,
  workflows: Map<string, Workflow>,
  existingRefs: Map<string, WorkflowRef>,
  messageID: string,
  contextVariables: Record<string, VariableResolver>,
  config: WorkflowConfig,
  expansionChain: string[] = [],
  depth: number = 0
): NestedExpansionResult {
  const result: NestedExpansionResult = {
    content,
    nestedWorkflows: [],
    hints: [],
    warnings: [],
    newRefs: new Map()
  };

  if (parentWorkflow.workflowInWorkflow === 'false') {
    return result;
  }

  const nestedMentions = detectWorkflowMentions(content);
  if (nestedMentions.length === 0) {
    return result;
  }

  if (parentWorkflow.workflowInWorkflow === 'hints') {
    const nestedNames = nestedMentions
      .map(m => findWorkflowByName(m.name, [...workflows.keys()]))
      .filter((n): n is string => n !== null);
    if (nestedNames.length > 0) {
      result.hints.push(`[Nested workflows in ${parentWorkflow.name}: //${nestedNames.join(', //')} - set workflowInWorkflow: true to expand]`);
    }
    return result;
  }

  // Merge existing refs with accumulated new refs for lookup
  const allRefs = new Map([...existingRefs, ...result.newRefs]);
  let expanded = content;

  for (const { name, force, args } of nestedMentions) {
    const canonicalName = findWorkflowByName(name, [...workflows.keys()]);
    if (!canonicalName) continue;

    const nestedWorkflow = workflows.get(canonicalName);
    if (!nestedWorkflow) continue;

    if (expansionChain.includes(canonicalName)) {
      result.warnings.push(`Circular reference detected: ${[...expansionChain, canonicalName].join(' → ')}`);
      continue;
    }

    if (depth >= config.maxNestingDepth) {
      result.warnings.push(`Max nesting depth (${config.maxNestingDepth}) reached at ${canonicalName}`);
      continue;
    }

    // Check both existing refs and newly added refs
    const existingRef = allRefs.get(canonicalName);
    if (existingRef && !force) {
      const mentionPattern = new RegExp(`(?<![:\\\\\\w/])//${name}!?(?![\\\\\\w-])`, 'g');
      expanded = expanded.replace(mentionPattern, `[use_workflow:${canonicalName}-${existingRef.id}]`);
      continue;
    }

    const id = shortId(messageID, canonicalName, expansionChain);
    const newRef: WorkflowRef = { id, messageID, implicit: false };
    result.newRefs.set(canonicalName, newRef);
    allRefs.set(canonicalName, newRef); // Update lookup map
    result.nestedWorkflows.push(canonicalName);

    const argsAsResolvers: Record<string, VariableResolver> = {};
    for (const [key, value] of Object.entries(args)) {
      argsAsResolvers[`args.${key}`] = () => value;
    }
    let nestedContent = expandVariables(nestedWorkflow.content, { ...contextVariables, ...argsAsResolvers });

    // Recursive call with merged refs
    const nestedResult = expandNestedWorkflows(
      nestedContent,
      nestedWorkflow,
      workflows,
      allRefs,
      messageID,
      contextVariables,
      config,
      [...expansionChain, canonicalName],
      depth + 1
    );

    nestedContent = nestedResult.content;
    result.nestedWorkflows.push(...nestedResult.nestedWorkflows);
    result.hints.push(...nestedResult.hints);
    result.warnings.push(...nestedResult.warnings);
    // Merge nested refs into our result
    for (const [k, v] of nestedResult.newRefs) {
      result.newRefs.set(k, v);
      allRefs.set(k, v);
    }

    const fullNestedContent = `\n\n<workflow name="${canonicalName}" id="${canonicalName}-${id}" source="${nestedWorkflow.source}">\n${nestedContent}\n</workflow>\n\n`;

    const mentionPattern = new RegExp(`(?<![:\\\\\\w/])//${name}!?(?![\\\\\\w-])`, 'g');
    expanded = expanded.replace(mentionPattern, fullNestedContent);
  }

  result.content = expanded;
  return result;
}


/**
 * Process a single text message, expanding workflow mentions.
 * Pure function: returns newRefs to be merged by caller.
 */
export function processMessageText(
  text: string,
  workflows: Map<string, Workflow>,
  existingRefs: Map<string, WorkflowRef>,
  messageID: string,
  contextVariables: Record<string, VariableResolver>,
  config: WorkflowConfig
): ExpansionResult {
  const mentions = detectWorkflowMentions(text);
  
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

  // Combine existing refs with accumulated new refs for lookups
  const allRefs = new Map([...existingRefs, ...result.newRefs]);
  
  // Phase 1: Replace all mentions with unique tokens to prevent regex collision
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

  // Phase 2: Process each mention
  for (const { name, force, args } of mentions) {
    const token = tokenMap.get(name);
    if (!token) continue;

    const canonicalName = findWorkflowByName(name, [...workflows.keys()]);
    const workflow = canonicalName ? workflows.get(canonicalName) : null;
    
    if (!workflow || !canonicalName) {
      result.notFound.push(name);
      const matches = findAllMatches(name, [...workflows.keys()], 3);
      if (matches.length > 0) result.suggestions.set(name, matches);
      expanded = expanded.split(token).join(`//${name}`);
      continue;
    }

    const existingRef = allRefs.get(canonicalName);
    const shouldFullInject = force || !existingRef || existingRef.implicit;

    if (shouldFullInject) {
      const id = shortId(messageID, canonicalName, []);
      const newRef: WorkflowRef = { id, messageID, implicit: false };
      result.newRefs.set(canonicalName, newRef);
      allRefs.set(canonicalName, newRef);
      result.found.push(canonicalName);
      
      const argsAsResolvers: Record<string, VariableResolver> = {};
      for (const [key, value] of Object.entries(args)) {
        argsAsResolvers[`args.${key}`] = () => value;
      }
      
      let expandedContent = expandVariables(workflow.content, { ...contextVariables, ...argsAsResolvers });
      
      const nestedResult = expandNestedWorkflows(
        expandedContent,
        workflow,
        workflows,
        allRefs,
        messageID,
        contextVariables,
        config,
        [canonicalName],
        1
      );
      expandedContent = nestedResult.content;
      result.found.push(...nestedResult.nestedWorkflows);
      result.hints.push(...nestedResult.hints);
      result.warnings.push(...nestedResult.warnings);
      
      // Merge nested refs
      for (const [k, v] of nestedResult.newRefs) {
        result.newRefs.set(k, v);
        allRefs.set(k, v);
      }
      
      if (nestedResult.hints.length > 0) {
        expandedContent += '\n\n' + nestedResult.hints.join('\n');
      }
      
      const fullContent = `\n\n<workflow name="${canonicalName}" id="${canonicalName}-${id}" source="${workflow.source}">\n${expandedContent}\n</workflow>\n\n`;

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
      result.reused.push(canonicalName);
      expanded = expanded.split(token).join(`[use_workflow:${canonicalName}-${existingRef!.id}]`);
    }
  }

  // Phase 3: Expand orphan [use_workflow:...] references that don't have full expansion in this message
  const useWorkflowPattern = /\[use_workflow:([\p{L}\p{N}_-]+)-[\p{L}\p{N}]+\]/gu;
  let refMatch;
  while ((refMatch = useWorkflowPattern.exec(expanded)) !== null) {
    const refName = refMatch[1];
    const hasFullExpansion = expanded.includes(`<workflow name="${refName}"`);
    if (!hasFullExpansion) {
      const existingRef = allRefs.get(refName);
      if (existingRef && existingRef.messageID !== messageID) {
        continue; // Reference from previous message, keep as-is
      }
      
      const workflow = workflows.get(refName);
      if (workflow) {
        const id = shortId(messageID, refName, []);
        const newRef: WorkflowRef = { id, messageID, implicit: true };
        result.newRefs.set(refName, newRef);
        allRefs.set(refName, newRef);
        if (!result.found.includes(refName)) {
          result.found.push(refName);
        }
        const idx = result.reused.indexOf(refName);
        if (idx !== -1) {
          result.reused.splice(idx, 1);
        }
        
        const expandedContent = expandVariables(workflow.content, contextVariables);
        const fullContent = `\n\n<workflow name="${refName}" id="${refName}-${id}" source="${workflow.source}">\n${expandedContent}\n</workflow>\n\n`;
        expanded = expanded.replace(refMatch[0], fullContent);
        useWorkflowPattern.lastIndex = 0;
      }
    }
  }

  result.text = expanded;
  return result;
}

export function expandWorkflowMentions(
  text: string,
  workflows: Map<string, Workflow>,
  config: WorkflowConfig
): { expanded: string; found: string[]; notFound: string[]; suggestions: Map<string, string> } {
  const mentions = detectWorkflowMentions(text);
  const found: string[] = [];
  const notFound: string[] = [];
  const suggestions = new Map<string, string>();
  let expanded = text;

  for (const { name, force, args } of mentions) {
    const workflow = workflows.get(name);
    if (workflow) {
      found.push(name);
      
      const mentionPatternStr = args && Object.keys(args).length > 0
        ? `(?<![:\\\\w/])//${name}\\([^)]*\\)!?(?![\\\\w-])`
        : `(?<![:\\\\w/])//${name}!?(?![\\\\w-])`;

      const fullContent = `\n\n<workflow name="${name}" source="${workflow.source}">\n${workflow.content}\n</workflow>\n\n`;

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
      const match = findBestMatch(name, [...workflows.keys()]);
      if (match) {
        suggestions.set(name, match);
      }
    }
  }

  return { expanded, found, notFound, suggestions };
}
