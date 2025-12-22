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

const WORKFLOW_MENTION_PATTERN = /(?<![:\w/])\/\/([a-zA-Z0-9][a-zA-Z0-9_-]*)(?:\(([^)]*)\))?(!)?/g;

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

export type OrGroup = { or: string[] };
export type TagEntry = string | string[] | OrGroup;

export function isOrGroup(entry: TagEntry): entry is OrGroup {
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
  let groupItems: string[] = [];
  
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
          groupItems.push(current.trim().replace(/['"]/g, ''));
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
        groupItems.push(trimmed);
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

export type AutoworkflowMode = 'true' | 'hintForUser' | 'false';

export interface ParsedFrontmatter {
  aliases: string[];
  tags: TagEntry[];
  agents: string[];
  description: string;
  autoworkflow: AutoworkflowMode;
  body: string;
}

export function parseFrontmatter(fileContent: string): ParsedFrontmatter {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = fileContent.match(frontmatterRegex);

  if (!match) {
    return { aliases: [], tags: [], agents: [], description: '', autoworkflow: 'false', body: fileContent };
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

  return { aliases, tags, agents, description, autoworkflow, body };
}

export function formatSuggestion(name: string, aliases: string[], maxAliases = 3): string {
  if (aliases.length === 0) return name;
  const topAliases = aliases.slice(0, maxAliases).join(' | ');
  return `${name} (${topAliases})`;
}

export type VariableResolver = () => string;

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
