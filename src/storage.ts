import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, statSync } from 'fs';
import { join, basename, relative } from 'path';
import { homedir } from 'os';
import type { Workflow, WorkflowConfig } from './types';
import { parseFrontmatter } from './engine';

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

export function getWorkflowDirs(projectDir: string): { path: string; source: 'project' | 'global' }[] {
  const dirs: { path: string; source: 'project' | 'global' }[] = [];

  const projectWorkflows = join(projectDir, '.opencode', 'workflows');
  if (existsSync(projectWorkflows)) {
    dirs.push({ path: projectWorkflows, source: 'project' });
  }

  const globalWorkflows = join(homedir(), '.config', 'opencode', 'workflows');
  if (existsSync(globalWorkflows)) {
    dirs.push({ path: globalWorkflows, source: 'global' });
  }

  return dirs;
}

interface WorkflowFile {
  filePath: string;
  folder?: string;
}

export function walkDir(dir: string, baseDir: string = dir): WorkflowFile[] {
  const results: WorkflowFile[] = [];
  
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

export function getWorkflowPath(name: string, scope: 'project' | 'global', projectDir: string): string {
  const safeName = name.replace(/[^\p{L}\p{N}_-]/gu, '');
  if (!safeName) throw new Error(`Invalid workflow name: ${name}`);

  let dir: string;
  if (scope === 'project') {
    dir = join(projectDir, '.opencode', 'workflows');
  } else {
    dir = join(homedir(), '.config', 'opencode', 'workflows');
  }

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return join(dir, `${safeName}.md`);
}

export function loadWorkflows(projectDir: string): Map<string, Workflow> {
  const workflows = new Map<string, Workflow>();
  const dirs = getWorkflowDirs(projectDir);

  for (const { path: dir, source } of dirs) {
    try {
      const files = walkDir(dir);
      for (const { filePath, folder } of files) {
        const name = basename(filePath, '.md');
        if (!workflows.has(name)) {
          const rawContent = readFileSync(filePath, 'utf-8');
          const { aliases, tags, agents, description, autoworkflow, workflowInWorkflow, body } = parseFrontmatter(rawContent);
          
          const workflow: Workflow = { 
            name, 
            aliases, 
            tags, 
            agents, 
            description, 
            autoworkflow, 
            workflowInWorkflow, 
            content: body, 
            source, 
            path: filePath,
            folder
          };
          workflows.set(name, workflow);
          
          aliases.forEach(alias => {
            if (!workflows.has(alias)) {
              workflows.set(alias, workflow);
            }
          });
        }
      }
    } catch (err) {
      console.error(`[workflows] Failed to load workflows from ${dir}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return workflows;
}

export function saveWorkflow(
  name: string, 
  content: string, 
  scope: 'project' | 'global', 
  projectDir: string
): string {
  const filePath = getWorkflowPath(name, scope, projectDir);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function deleteWorkflow(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

export function renameWorkflowFile(oldPath: string, newPath: string): void {
  if (existsSync(oldPath)) {
    renameSync(oldPath, newPath);
  }
}

export function workflowExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function readWorkflowContent(filePath: string): string {
  return readFileSync(filePath, 'utf-8');
}

export { existsSync, readFileSync, writeFileSync, unlinkSync, renameSync, mkdirSync, statSync, basename, join, relative, homedir };
