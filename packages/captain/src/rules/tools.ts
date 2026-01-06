import type { Rule } from './types';
import type { CaptainConfig, Theme } from '../core/types';
import { 
  loadPrompts, 
  savePrompt, 
  deletePrompt, 
  renamePromptFile, 
  promptExists,
  getPromptPath,
  toWritableScope
} from '../core/storage';
import { loadConfig, detectTheme } from '../core/config';
import { parseRuleFrontmatter } from './parser';

export interface RulesState {
  rules: Map<string, Rule>;
  config: CaptainConfig;
  theme: Theme;
  projectDir: string;
}

export function loadRules(projectDir: string): Map<string, Rule> {
  return loadPrompts<Rule>(projectDir, 'rule', (name, fileContent, source, filePath, folder) => {
    const parsed = parseRuleFrontmatter(fileContent);
    return {
      name,
      promptType: 'rule',
      aliases: parsed.aliases,
      tags: parsed.tags,
      onlyFor: parsed.onlyFor,
      description: parsed.description,
      content: parsed.body,
      source,
      path: filePath,
      folder,
    };
  });
}

export function createRulesState(projectDir: string): RulesState {
  const rules = loadRules(projectDir);
  const config = loadConfig();
  const theme = detectTheme(projectDir);
  return { rules, config, theme, projectDir };
}

export function reloadRules(state: RulesState): void {
  state.rules = loadRules(state.projectDir);
  state.config = loadConfig();
  state.theme = detectTheme(state.projectDir);
}

export interface ListRulesParams {
  folder?: string;
  name?: string;
  scope?: 'global' | 'project';
}

export function listRules(state: RulesState, params: ListRulesParams = {}): Rule[] {
  const seen = new Set<string>();
  const results: Rule[] = [];
  
  for (const rule of state.rules.values()) {
    if (seen.has(rule.name)) continue;
    seen.add(rule.name);
    
    if (params.folder && rule.folder !== params.folder) continue;
    if (params.name && !rule.name.toLowerCase().includes(params.name.toLowerCase())) continue;
    if (params.scope && rule.source !== params.scope) continue;
    
    results.push(rule);
  }
  
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function getRule(state: RulesState, name: string): Rule | null {
  return state.rules.get(name) || null;
}

export interface CreateRuleParams {
  name: string;
  content: string;
  scope?: 'global' | 'project';
  description?: string;
  shortcuts?: string;
  onlyFor?: string;
}

export function createRule(state: RulesState, params: CreateRuleParams): string {
  const scope = params.scope || 'project';
  
  let frontmatter = '---\n';
  if (params.description) frontmatter += `description: "${params.description}"\n`;
  if (params.shortcuts) frontmatter += `shortcuts: [${params.shortcuts}]\n`;
  if (params.onlyFor) frontmatter += `onlyFor: [${params.onlyFor}]\n`;
  frontmatter += '---\n\n';
  
  const fullContent = frontmatter + params.content;
  const filePath = savePrompt(params.name, fullContent, scope, 'rule', state.projectDir);
  
  reloadRules(state);
  return filePath;
}

export interface EditRuleParams {
  name: string;
  content: string;
  createIfMissing?: boolean;
  scope?: 'global' | 'project';
}

export function editRule(state: RulesState, params: EditRuleParams): string {
  const existingRule = state.rules.get(params.name);
  
  if (!existingRule) {
    if (params.createIfMissing) {
      return createRule(state, { 
        name: params.name, 
        content: params.content, 
        scope: params.scope 
      });
    }
    throw new Error(`Rule "${params.name}" not found`);
  }
  
  const scope = toWritableScope(params.scope || existingRule.source);
  const filePath = savePrompt(params.name, params.content, scope, 'rule', state.projectDir);
  
  reloadRules(state);
  return filePath;
}

export function deleteRule(state: RulesState, name: string): void {
  const rule = state.rules.get(name);
  if (!rule) {
    throw new Error(`Rule "${name}" not found`);
  }
  
  deletePrompt(rule.path);
  reloadRules(state);
}

export interface RenameRuleParams {
  oldName: string;
  newName: string;
  scope?: 'global' | 'project';
}

export function renameRule(state: RulesState, params: RenameRuleParams): string {
  const rule = state.rules.get(params.oldName);
  if (!rule) {
    throw new Error(`Rule "${params.oldName}" not found`);
  }
  
  const scope = toWritableScope(params.scope || rule.source);
  const newPath = getPromptPath(params.newName, scope, 'rule', state.projectDir);
  
  if (promptExists(newPath)) {
    throw new Error(`Rule "${params.newName}" already exists`);
  }
  
  renamePromptFile(rule.path, newPath);
  reloadRules(state);
  return newPath;
}
