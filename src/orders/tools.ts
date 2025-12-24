import type { Order } from './types';
import type { CaptainConfig, Theme } from '../core/types';
import { 
  loadPrompts, 
  savePrompt, 
  deletePrompt, 
  renamePromptFile, 
  promptExists,
  getPromptPath
} from '../core/storage';
import { loadConfig, detectTheme } from '../core/config';
import { expandVariables } from '../core/variables';
import { parseOrderFrontmatter } from './parser';
import { expandOrderMentions } from './engine';

export interface OrdersState {
  orders: Map<string, Order>;
  config: CaptainConfig;
  theme: Theme;
  projectDir: string;
}

export function loadOrders(projectDir: string): Map<string, Order> {
  return loadPrompts<Order>(projectDir, 'order', (name, fileContent, source, filePath, folder) => {
    const parsed = parseOrderFrontmatter(fileContent);
    return {
      name,
      aliases: parsed.aliases,
      tags: parsed.tags,
      onlyFor: parsed.onlyFor,
      spawnAt: parsed.spawnAt,
      description: parsed.description,
      automention: parsed.automention,
      orderInOrder: parsed.orderInOrder,
      content: parsed.body,
      source,
      path: filePath,
      folder,
    };
  });
}

export function createOrdersState(projectDir: string): OrdersState {
  const orders = loadOrders(projectDir);
  const config = loadConfig();
  const theme = detectTheme(projectDir);
  return { orders, config, theme, projectDir };
}

export function reloadOrders(state: OrdersState): void {
  state.orders = loadOrders(state.projectDir);
  state.config = loadConfig();
  state.theme = detectTheme(state.projectDir);
}

export interface ListOrdersParams {
  folder?: string;
  name?: string;
  scope?: 'global' | 'project';
  tag?: string;
}

export function listOrders(state: OrdersState, params: ListOrdersParams = {}): Order[] {
  const seen = new Set<string>();
  const results: Order[] = [];
  
  for (const order of state.orders.values()) {
    if (seen.has(order.name)) continue;
    seen.add(order.name);
    
    if (params.folder && order.folder !== params.folder) continue;
    if (params.name && !order.name.toLowerCase().includes(params.name.toLowerCase())) continue;
    if (params.scope && order.source !== params.scope) continue;
    if (params.tag) {
      const hasTag = order.tags.some(t => {
        if (typeof t === 'string') return t.toLowerCase().includes(params.tag!.toLowerCase());
        if (Array.isArray(t)) return t.some(item => 
          typeof item === 'string' && item.toLowerCase().includes(params.tag!.toLowerCase())
        );
        if ('or' in t) return t.or.some(o => o.toLowerCase().includes(params.tag!.toLowerCase()));
        return false;
      });
      if (!hasTag) continue;
    }
    
    results.push(order);
  }
  
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function getOrder(state: OrdersState, name: string): Order | null {
  return state.orders.get(name) || null;
}

export interface CreateOrderParams {
  name: string;
  content: string;
  scope?: 'global' | 'project';
  description?: string;
  shortcuts?: string;
  tags?: string;
  automention?: string;
  onlyFor?: string;
  spawnAt?: string;
}

export function createOrder(state: OrdersState, params: CreateOrderParams): string {
  const scope = params.scope || 'project';
  
  let frontmatter = '---\n';
  if (params.description) frontmatter += `description: "${params.description}"\n`;
  if (params.shortcuts) frontmatter += `shortcuts: [${params.shortcuts}]\n`;
  if (params.tags) frontmatter += `tags: [${params.tags}]\n`;
  if (params.automention) frontmatter += `automention: ${params.automention}\n`;
  if (params.onlyFor) frontmatter += `onlyFor: [${params.onlyFor}]\n`;
  if (params.spawnAt) frontmatter += `spawnAt: [${params.spawnAt}]\n`;
  frontmatter += '---\n\n';
  
  const fullContent = frontmatter + params.content;
  const filePath = savePrompt(params.name, fullContent, scope, 'order', state.projectDir);
  
  reloadOrders(state);
  return filePath;
}

export interface EditOrderParams {
  name: string;
  content: string;
  createIfMissing?: boolean;
  scope?: 'global' | 'project';
}

export function editOrder(state: OrdersState, params: EditOrderParams): string {
  const existingOrder = state.orders.get(params.name);
  
  if (!existingOrder) {
    if (params.createIfMissing) {
      return createOrder(state, { 
        name: params.name, 
        content: params.content, 
        scope: params.scope 
      });
    }
    throw new Error(`Order "${params.name}" not found`);
  }
  
  const scope = params.scope || existingOrder.source;
  const filePath = savePrompt(params.name, params.content, scope, 'order', state.projectDir);
  
  reloadOrders(state);
  return filePath;
}

export function deleteOrder(state: OrdersState, name: string): void {
  const order = state.orders.get(name);
  if (!order) {
    throw new Error(`Order "${name}" not found`);
  }
  
  deletePrompt(order.path);
  reloadOrders(state);
}

export interface RenameOrderParams {
  oldName: string;
  newName: string;
  scope?: 'global' | 'project';
}

export function renameOrder(state: OrdersState, params: RenameOrderParams): string {
  const order = state.orders.get(params.oldName);
  if (!order) {
    throw new Error(`Order "${params.oldName}" not found`);
  }
  
  const scope = params.scope || order.source;
  const newPath = getPromptPath(params.newName, scope, 'order', state.projectDir);
  
  if (promptExists(newPath)) {
    throw new Error(`Order "${params.newName}" already exists`);
  }
  
  renamePromptFile(order.path, newPath);
  reloadOrders(state);
  return newPath;
}

export function expandOrder(state: OrdersState, text: string): { 
  expanded: string; 
  found: string[]; 
  notFound: string[];
  suggestions: Map<string, string>;
} {
  const result = expandOrderMentions(text, state.orders, state.config);
  return {
    expanded: expandVariables(result.expanded),
    found: result.found,
    notFound: result.notFound,
    suggestions: result.suggestions,
  };
}

export function getOrderContent(state: OrdersState, name: string): string | null {
  const order = state.orders.get(name);
  if (!order) return null;
  return expandVariables(order.content);
}
