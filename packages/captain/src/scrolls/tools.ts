import type { Scroll } from './types';
import type { CaptainConfig, Theme, TagEntry } from '../core/types';
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
import { expandVariables } from '../core/variables';
import { parseScrollFrontmatter } from './parser';
import { expandOrderMentions } from './engine';
import { resolveScrollIncludes } from './resolver';

export interface ScrollsState {
  scrolls: Map<string, Scroll>;
  config: CaptainConfig;
  theme: Theme;
  projectDir: string;
}

export interface OrdersState extends ScrollsState {
  orders: Map<string, Scroll>;
}

export function loadScrolls(projectDir: string): Map<string, Scroll> {
  return loadPrompts<Scroll>(projectDir, 'scroll', (name, fileContent, source, filePath, folder) => {
    const parsed = parseScrollFrontmatter(fileContent);
    
    const baseScroll: Scroll = {
      name,
      promptType: 'scroll',
      aliases: parsed.aliases,
      tags: parsed.tags,
      onlyFor: parsed.onlyFor,
      spawnFor: parsed.spawnFor,
      description: parsed.description,
      automention: parsed.automention,
      scrollInScroll: parsed.scrollInScroll,
      expand: parsed.expand,
      include: parsed.include,
      includeWarnings: [],
      content: parsed.body,
      source,
      path: filePath,
      folder,
      onLoad: parsed.onLoad,
    };
    
    if (parsed.include.length > 0) {
      const resolved = resolveScrollIncludes(baseScroll, projectDir);
      baseScroll.content = resolved.content;
      baseScroll.includeWarnings = resolved.warnings;
    }
    
    return baseScroll;
  });
}
export const loadOrders = loadScrolls;

export function createScrollsState(projectDir: string): OrdersState {
  const scrolls = loadScrolls(projectDir);
  const config = loadConfig();
  const theme = detectTheme(projectDir);
  return { scrolls, orders: scrolls, config, theme, projectDir };
}
export const createOrdersState = createScrollsState;

export function reloadScrolls(state: OrdersState): void {
  const scrolls = loadScrolls(state.projectDir);
  state.scrolls = scrolls;
  state.orders = scrolls;
  state.config = loadConfig();
  state.theme = detectTheme(state.projectDir);
}
export const reloadOrders = reloadScrolls;

export interface ListScrollsParams {
  folder?: string;
  name?: string;
  scope?: 'global' | 'project';
  tag?: string;
}
export type ListOrdersParams = ListScrollsParams;

export function listScrolls(state: OrdersState, params: ListScrollsParams = {}): Scroll[] {
  const seen = new Set<string>();
  const results: Scroll[] = [];
  
  for (const scroll of state.scrolls.values()) {
    if (seen.has(scroll.name)) continue;
    seen.add(scroll.name);
    
    if (params.folder && scroll.folder !== params.folder) continue;
    if (params.name && !scroll.name.toLowerCase().includes(params.name.toLowerCase())) continue;
    if (params.scope && scroll.source !== params.scope) continue;
    if (params.tag) {
      const hasTag = scroll.tags.some((t: TagEntry) => {
        if (typeof t === 'string') return t.toLowerCase().includes(params.tag!.toLowerCase());
        if (Array.isArray(t)) return t.some(item => 
          typeof item === 'string' && item.toLowerCase().includes(params.tag!.toLowerCase())
        );
        if ('or' in t) return t.or.some(o => o.toLowerCase().includes(params.tag!.toLowerCase()));
        return false;
      });
      if (!hasTag) continue;
    }
    
    results.push(scroll);
  }
  
  return results.sort((a, b) => a.name.localeCompare(b.name));
}
export const listOrders = listScrolls;

export function getScroll(state: OrdersState, name: string): Scroll | null {
  return state.scrolls.get(name) || null;
}
export const getOrder = getScroll;

export interface CreateScrollParams {
  name: string;
  content: string;
  scope?: 'global' | 'project';
  description?: string;
  shortcuts?: string;
  tags?: string;
  automention?: string;
  onlyFor?: string;
  spawnFor?: string;
  spawnAt?: string;
  expand?: string;
}
export type CreateOrderParams = CreateScrollParams;

export function createScroll(state: OrdersState, params: CreateScrollParams): string {
  const scope = params.scope || 'project';
  
  let frontmatter = '---\n';
  if (params.description) frontmatter += `description: "${params.description}"\n`;
  if (params.shortcuts) frontmatter += `shortcuts: [${params.shortcuts}]\n`;
  if (params.tags) frontmatter += `tags: [${params.tags}]\n`;
  if (params.automention) frontmatter += `automention: ${params.automention}\n`;
  if (params.onlyFor) frontmatter += `onlyFor: [${params.onlyFor}]\n`;
  const spawnValue = params.spawnFor || params.spawnAt;
  if (spawnValue) frontmatter += `spawnFor: [${spawnValue}]\n`;
  if (params.expand) frontmatter += `expand: ${params.expand}\n`;
  frontmatter += '---\n\n';
  
  const fullContent = frontmatter + params.content;
  const filePath = savePrompt(params.name, fullContent, scope, 'scroll', state.projectDir);
  
  reloadScrolls(state);
  return filePath;
}
export const createOrder = createScroll;

export interface EditScrollParams {
  name: string;
  content: string;
  createIfMissing?: boolean;
  scope?: 'global' | 'project';
}
export type EditOrderParams = EditScrollParams;

export function editScroll(state: OrdersState, params: EditScrollParams): string {
  const existingScroll = state.scrolls.get(params.name);
  
  if (!existingScroll) {
    if (params.createIfMissing) {
      return createScroll(state, { 
        name: params.name, 
        content: params.content, 
        scope: params.scope 
      });
    }
    throw new Error(`Scroll "${params.name}" not found`);
  }
  
  const scope = toWritableScope(params.scope || existingScroll.source);
  const filePath = savePrompt(params.name, params.content, scope, 'scroll', state.projectDir);
  
  reloadScrolls(state);
  return filePath;
}
export const editOrder = editScroll;

export function deleteScroll(state: OrdersState, name: string): void {
  const scroll = state.scrolls.get(name);
  if (!scroll) {
    throw new Error(`Scroll "${name}" not found`);
  }
  
  deletePrompt(scroll.path);
  reloadScrolls(state);
}
export const deleteOrder = deleteScroll;

export interface RenameScrollParams {
  oldName: string;
  newName: string;
  scope?: 'global' | 'project';
}
export type RenameOrderParams = RenameScrollParams;

export function renameScroll(state: OrdersState, params: RenameScrollParams): string {
  const scroll = state.scrolls.get(params.oldName);
  if (!scroll) {
    throw new Error(`Scroll "${params.oldName}" not found`);
  }
  
  const scope = toWritableScope(params.scope || scroll.source);
  const newPath = getPromptPath(params.newName, scope, 'scroll', state.projectDir);
  
  if (promptExists(newPath)) {
    throw new Error(`Scroll "${params.newName}" already exists`);
  }
  
  renamePromptFile(scroll.path, newPath);
  reloadScrolls(state);
  return newPath;
}
export const renameOrder = renameScroll;

export function expandScroll(state: OrdersState, text: string): { 
  expanded: string; 
  found: string[]; 
  notFound: string[];
  suggestions: Map<string, string>;
} {
  const result = expandOrderMentions(text, state.scrolls, state.config);
  return {
    expanded: expandVariables(result.expanded),
    found: result.found,
    notFound: result.notFound,
    suggestions: result.suggestions,
  };
}
export const expandOrder = expandScroll;

export function getScrollContent(state: OrdersState, name: string): string | null {
  const scroll = state.scrolls.get(name);
  if (!scroll) return null;
  return expandVariables(scroll.content);
}
export const getOrderContent = getScrollContent;
