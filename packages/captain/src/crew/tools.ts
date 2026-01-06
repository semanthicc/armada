import type { Crew } from './types';
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
import { parseCrewFrontmatter } from './parser';

export interface CrewsState {
  crews: Map<string, Crew>;
  config: CaptainConfig;
  theme: Theme;
  projectDir: string;
}

export function loadCrews(projectDir: string): Map<string, Crew> {
  return loadPrompts<Crew>(projectDir, 'crew', (name, fileContent, source, filePath, folder) => {
    const parsed = parseCrewFrontmatter(fileContent);
    return {
      name,
      promptType: 'crew',
      aliases: parsed.aliases,
      tags: parsed.tags,
      onlyFor: parsed.onlyFor,
      description: parsed.description,
      content: parsed.body,
      source,
      path: filePath,
      folder,
      model: parsed.model,
      temperature: parsed.temperature,
      tools: parsed.tools,
      mode: parsed.mode || 'subagent',
      spawnWith: parsed.spawnWith,
      toolPolicy: parsed.toolPolicy,
    };
  });
}

export function createCrewsState(projectDir: string): CrewsState {
  const crews = loadCrews(projectDir);
  const config = loadConfig();
  const theme = detectTheme(projectDir);
  return { crews, config, theme, projectDir };
}

export function reloadCrews(state: CrewsState): void {
  state.crews = loadCrews(state.projectDir);
  state.config = loadConfig();
  state.theme = detectTheme(state.projectDir);
}

export interface ListCrewsParams {
  folder?: string;
  name?: string;
  scope?: 'global' | 'project';
}

export function listCrews(state: CrewsState, params: ListCrewsParams = {}): Crew[] {
  const seen = new Set<string>();
  const results: Crew[] = [];
  
  for (const crew of state.crews.values()) {
    if (seen.has(crew.name)) continue;
    seen.add(crew.name);
    
    if (params.folder && crew.folder !== params.folder) continue;
    if (params.name && !crew.name.toLowerCase().includes(params.name.toLowerCase())) continue;
    if (params.scope && crew.source !== params.scope) continue;
    
    results.push(crew);
  }
  
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function getCrew(state: CrewsState, name: string): Crew | null {
  return state.crews.get(name) || null;
}

export interface CreateCrewParams {
  name: string;
  content: string;
  scope?: 'global' | 'project';
  description?: string;
  shortcuts?: string;
  onlyFor?: string;
  model?: string;
  temperature?: number;
  tools?: string;
  mode?: 'agent' | 'subagent';
}

export function createCrew(state: CrewsState, params: CreateCrewParams): string {
  const scope = params.scope || 'project';
  
  let frontmatter = '---\n';
  if (params.description) frontmatter += `description: "${params.description}"\n`;
  if (params.shortcuts) frontmatter += `shortcuts: [${params.shortcuts}]\n`;
  if (params.onlyFor) frontmatter += `onlyFor: [${params.onlyFor}]\n`;
  if (params.model) frontmatter += `model: ${params.model}\n`;
  if (params.temperature !== undefined) frontmatter += `temperature: ${params.temperature}\n`;
  if (params.tools) frontmatter += `tools: ${params.tools}\n`;
  if (params.mode) frontmatter += `mode: ${params.mode}\n`;
  frontmatter += '---\n\n';
  
  const fullContent = frontmatter + params.content;
  const filePath = savePrompt(params.name, fullContent, scope, 'crew', state.projectDir);
  
  reloadCrews(state);
  return filePath;
}

export interface EditCrewParams {
  name: string;
  content: string;
  createIfMissing?: boolean;
  scope?: 'global' | 'project';
}

export function editCrew(state: CrewsState, params: EditCrewParams): string {
  const existingCrew = state.crews.get(params.name);
  
  if (!existingCrew) {
    if (params.createIfMissing) {
      return createCrew(state, { 
        name: params.name, 
        content: params.content, 
        scope: params.scope 
      });
    }
    throw new Error(`Crew "${params.name}" not found`);
  }
  
  const scope = toWritableScope(params.scope || existingCrew.source);
  const filePath = savePrompt(params.name, params.content, scope, 'crew', state.projectDir);
  
  reloadCrews(state);
  return filePath;
}

export function deleteCrew(state: CrewsState, name: string): void {
  const crew = state.crews.get(name);
  if (!crew) {
    throw new Error(`Crew "${name}" not found`);
  }
  
  deletePrompt(crew.path);
  reloadCrews(state);
}

export interface RenameCrewParams {
  oldName: string;
  newName: string;
  scope?: 'global' | 'project';
}

export function renameCrew(state: CrewsState, params: RenameCrewParams): string {
  const crew = state.crews.get(params.oldName);
  if (!crew) {
    throw new Error(`Crew "${params.oldName}" not found`);
  }
  
  const scope = toWritableScope(params.scope || crew.source);
  const newPath = getPromptPath(params.newName, scope, 'crew', state.projectDir);
  
  if (promptExists(newPath)) {
    throw new Error(`Crew "${params.newName}" already exists`);
  }
  
  renamePromptFile(crew.path, newPath);
  reloadCrews(state);
  return newPath;
}
