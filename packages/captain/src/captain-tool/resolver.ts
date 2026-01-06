import type {
  ToolModule,
  ResolvedTool,
  ToolError,
  ParametersDefinition,
  ToolExecuteFn,
} from './types';
import { isToolDefinition } from './types';
import { discoverTools } from './discovery';

export async function loadTool(filePath: string): Promise<ToolModule> {
  const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
  return await import(fileUrl);
}

function extractToolInfo(
  module: ToolModule,
  toolPath: string
): { description: string; parameters: ParametersDefinition; execute: ToolExecuteFn } | ToolError {
  if (isToolDefinition(module.default)) {
    return {
      description: module.default.description,
      parameters: module.default.parameters,
      execute: module.default.execute,
    };
  }

  if (typeof module.default === 'function') {
    return {
      description: module.description ?? `Tool: ${toolPath}`,
      parameters: module.parameters ?? {},
      execute: module.default,
    };
  }

  return { error: `Tool "${toolPath}" does not export a default function or defineTool()` };
}

export async function resolveTool(
  projectDir: string,
  toolPath: string
): Promise<ResolvedTool | ToolError> {
  const allTools = discoverTools(projectDir);
  const found = allTools.find((t) => t.path === toolPath);

  if (!found) {
    const available = allTools.map((t) => t.path).slice(0, 10);
    const hint = available.length > 0 ? ` Available: ${available.join(', ')}` : '';
    return { error: `Tool not found: "${toolPath}".${hint}` };
  }

  try {
    const module = await loadTool(found.filePath);
    const info = extractToolInfo(module, toolPath);

    if ('error' in info) return info;

    return {
      path: toolPath,
      filePath: found.filePath,
      description: info.description,
      parameters: info.parameters,
      execute: info.execute,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return { error: `Failed to load tool "${toolPath}": ${message}`, stack };
  }
}
