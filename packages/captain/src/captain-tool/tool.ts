import { z } from 'zod';
import type { CaptainToolResult } from './types';
import { isToolError } from './types';
import { resolveTool } from './resolver';
import { validateParams } from './validation';
import { discoverTools } from './discovery';

export function createCaptainTool(projectDir: string) {
  return {
    name: 'captain_tool',
    description:
      'Execute a workflow-defined custom tool. Use get_workflow first to discover available tools and their parameters.',
    parameters: z.object({
      tool: z
        .string()
        .describe("Tool path: 'category/tool' or 'category/workflow/tool'"),
      params: z
        .object({})
        .passthrough()
        .optional()
        .describe('Parameters to pass to the tool'),
    }),
    execute: async ({
      tool,
      params = {},
    }: {
      tool: string;
      params?: Record<string, unknown>;
    }): Promise<CaptainToolResult> => {
      const resolved = await resolveTool(projectDir, tool);

      if (isToolError(resolved)) {
        return resolved;
      }

      const validation = validateParams(resolved.parameters, params);

      if ('error' in validation) {
        return validation;
      }

      try {
        const result = await resolved.execute(validation.params);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        return { error: `Tool execution failed: ${message}`, stack };
      }
    },
  };
}

export function listAvailableTools(projectDir: string): string {
  const tools = discoverTools(projectDir);

  if (tools.length === 0) {
    return '';
  }

  const lines = tools.map((t) => `- captain_tool("${t.path}", {...})`);
  return `\n## Available Captain Tools\n${lines.join('\n')}`;
}
