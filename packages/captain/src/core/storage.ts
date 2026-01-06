import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, statSync } from 'fs';
import { join, basename, relative, dirname } from 'path';
import { homedir } from 'os';
import type { PromptType, BasePrompt, PromptSource } from './types';
import { parseBaseFrontmatter } from './parser';

export const FOLDER_ALIASES: Record<PromptType, string[]> = {
  scroll: ['scrolls', 'orders', 'workflows', 'commands'],
  order: ['scrolls', 'orders', 'workflows', 'commands'],
  rule: ['rules', 'creeds', 'code'],
  crew: ['crew', 'agents', 'mates'],
};

// Plugin root directory (where this code lives)
const PLUGIN_ROOT = join(dirname(dirname(__dirname)));

export interface PromptDir {
  path: string;
  source: PromptSource;
  folderName: string;
}

export interface PromptFile {
  filePath: string;
  folder?: string;
}

export function getPromptDirs(projectDir: string, promptType: PromptType): PromptDir[] {
  const aliases = FOLDER_ALIASES[promptType];
  const dirs: PromptDir[] = [];
  
  for (const alias of aliases) {
    const projectPath = join(projectDir, '.opencode', alias);
    if (existsSync(projectPath)) {
      dirs.push({ path: projectPath, source: 'project', folderName: alias });
    }
  }
  
  for (const alias of aliases) {
    const globalPath = join(homedir(), '.config', 'opencode', alias);
    if (existsSync(globalPath)) {
      dirs.push({ path: globalPath, source: 'global', folderName: alias });
    }
  }
  
  // Bundled scrolls have lowest priority - can be overridden by project/global
  for (const alias of aliases) {
    const bundledPath = join(PLUGIN_ROOT, alias);
    if (existsSync(bundledPath)) {
      dirs.push({ path: bundledPath, source: 'bundled', folderName: alias });
    }
  }
  
  return dirs;
}

export function walkDir(dir: string, baseDir: string = dir): PromptFile[] {
  const results: PromptFile[] = [];
  
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        results.push(...walkDir(fullPath, baseDir));
      } else if (entry.endsWith('.md')) {
        const relDir = relative(baseDir, dir);
        results.push({
          filePath: fullPath,
          folder: relDir || undefined
        });
      }
    }
  } catch (err) {
    // Directory unreadable, skip
  }
  
  return results;
}

export type WritableScope = 'project' | 'global';

export function toWritableScope(source: PromptSource): WritableScope {
  return source === 'bundled' ? 'global' : source;
}

export function getPromptPath(
  name: string, 
  scope: 'project' | 'global', 
  promptType: PromptType,
  projectDir: string
): string {
  const safeName = name.replace(/[^\p{L}\p{N}_-]/gu, '');
  if (!safeName) throw new Error(`Invalid prompt name: ${name}`);

  const primaryFolder = FOLDER_ALIASES[promptType][0];
  let dir: string;
  
  if (scope === 'project') {
    dir = join(projectDir, '.opencode', primaryFolder);
  } else {
    dir = join(homedir(), '.config', 'opencode', primaryFolder);
  }

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return join(dir, `${safeName}.md`);
}

export type PromptParser<T extends BasePrompt> = (
  name: string,
  fileContent: string,
  source: PromptSource,
  filePath: string,
  folder?: string
) => T;

export function loadPrompts<T extends BasePrompt>(
  projectDir: string,
  promptType: PromptType,
  parser: PromptParser<T>
): Map<string, T> {
  const prompts = new Map<string, T>();
  const dirs = getPromptDirs(projectDir, promptType);

  for (const { path: dir, source } of dirs) {
    try {
      const files = walkDir(dir);
      for (const { filePath, folder } of files) {
        const baseName = basename(filePath, '.md');
        let name: string;
        
        if (baseName === 'index' && folder) {
          name = folder.replace(/\\/g, '/');
        } else {
          name = folder ? `${folder}/${baseName}`.replace(/\\/g, '/') : baseName;
        }

        if (!prompts.has(name)) {
          const rawContent = readFileSync(filePath, 'utf-8');
          const prompt = parser(name, rawContent, source, filePath, folder);
          prompts.set(name, prompt);
          
          prompt.aliases.forEach(alias => {
            if (!prompts.has(alias)) {
              prompts.set(alias, prompt);
            }
          });
        }
      }
    } catch (err) {
      console.error(`[captain] Failed to load ${promptType}s from ${dir}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return prompts;
}

export function savePrompt(
  name: string, 
  content: string, 
  scope: 'project' | 'global',
  promptType: PromptType,
  projectDir: string
): string {
  const filePath = getPromptPath(name, scope, promptType, projectDir);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function deletePrompt(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function renamePromptFile(oldPath: string, newPath: string): void {
  if (existsSync(oldPath)) {
    renameSync(oldPath, newPath);
  }
}

export function promptExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function readPromptContent(filePath: string): string {
  return readFileSync(filePath, 'utf-8');
}

export { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync, mkdirSync, statSync, basename, join, relative, homedir };
