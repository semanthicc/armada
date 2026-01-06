import { readdirSync, statSync, existsSync } from 'fs';
import { join, basename, relative, dirname } from 'path';
import { homedir } from 'os';
import type { DiscoveredTool } from './types';

const PLUGIN_ROOT = join(dirname(dirname(__dirname)));

const SCROLL_FOLDER_ALIASES = ['scrolls', 'orders', 'workflows', 'commands'];

interface ToolsDirectory {
  path: string;
  source: 'project' | 'global' | 'bundled';
}

function getScrollDirs(projectDir: string): ToolsDirectory[] {
  const dirs: ToolsDirectory[] = [];

  for (const alias of SCROLL_FOLDER_ALIASES) {
    const projectPath = join(projectDir, '.opencode', alias);
    if (existsSync(projectPath)) {
      dirs.push({ path: projectPath, source: 'project' });
    }
  }

  for (const alias of SCROLL_FOLDER_ALIASES) {
    const globalPath = join(homedir(), '.config', 'opencode', alias);
    if (existsSync(globalPath)) {
      dirs.push({ path: globalPath, source: 'global' });
    }
  }

  for (const alias of SCROLL_FOLDER_ALIASES) {
    const bundledPath = join(PLUGIN_ROOT, alias);
    if (existsSync(bundledPath)) {
      dirs.push({ path: bundledPath, source: 'bundled' });
    }
  }

  return dirs;
}

function findToolsFolders(dir: string, baseDir: string = dir): string[] {
  const toolsFolders: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (entry.startsWith('_')) continue;

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (entry === 'tools') {
          toolsFolders.push(fullPath);
        } else {
          toolsFolders.push(...findToolsFolders(fullPath, baseDir));
        }
      }
    }
  } catch {}

  return toolsFolders;
}

function parseToolPath(toolsFolder: string, toolFile: string, scrollsRoot: string): DiscoveredTool {
  const toolName = basename(toolFile, '.ts');
  const toolFilePath = join(toolsFolder, toolFile);

  const relativeToRoot = relative(scrollsRoot, toolsFolder);
  const pathParts = relativeToRoot.split(/[/\\]/).filter((p) => p && p !== 'tools');

  let category: string | null = null;
  let workflow: string | null = null;
  let toolPath: string;

  if (pathParts.length === 0) {
    toolPath = toolName;
  } else if (pathParts.length === 1) {
    category = pathParts[0];
    toolPath = `${category}/${toolName}`;
  } else {
    category = pathParts[0];
    workflow = pathParts.slice(1).join('/');
    toolPath = `${category}/${workflow}/${toolName}`;
  }

  return {
    path: toolPath,
    filePath: toolFilePath,
    category,
    workflow,
    name: toolName,
  };
}

export function discoverTools(projectDir: string): DiscoveredTool[] {
  const tools: DiscoveredTool[] = [];
  const seenPaths = new Set<string>();

  const scrollDirs = getScrollDirs(projectDir);

  for (const { path: scrollsRoot } of scrollDirs) {
    const toolsFolders = findToolsFolders(scrollsRoot);

    for (const toolsFolder of toolsFolders) {
      try {
        const entries = readdirSync(toolsFolder);

        for (const entry of entries) {
          if (!entry.endsWith('.ts') || entry.startsWith('_')) continue;

          const tool = parseToolPath(toolsFolder, entry, scrollsRoot);

          if (!seenPaths.has(tool.path)) {
            seenPaths.add(tool.path);
            tools.push(tool);
          }
        }
      } catch {}
    }
  }

  return tools;
}

export function discoverToolsForWorkflow(
  projectDir: string,
  workflowPath: string
): DiscoveredTool[] {
  const allTools = discoverTools(projectDir);
  const parts = workflowPath.split('/');

  return allTools.filter((tool) => {
    if (parts.length === 1) {
      return tool.category === null;
    }

    const category = parts[0];
    const workflow = parts.slice(1).join('/');

    const isCategoryTool = tool.category === category && tool.workflow === null;
    const isWorkflowTool = tool.category === category && tool.workflow === workflow;

    return isCategoryTool || isWorkflowTool;
  });
}
