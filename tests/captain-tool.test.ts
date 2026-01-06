import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  defineTool,
  discoverTools,
  discoverToolsForWorkflow,
  resolveTool,
  validateParams,
  isToolError,
} from '../src/captain-tool';

const TEST_DIR = join(tmpdir(), 'captain-tool-test-' + Date.now());

beforeAll(() => {
  mkdirSync(join(TEST_DIR, '.opencode', 'scrolls', 'tools'), { recursive: true });
  mkdirSync(join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'tools'), { recursive: true });
  mkdirSync(join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'audience-research', 'tools'), { recursive: true });
  mkdirSync(join(TEST_DIR, '.opencode', 'scrolls', 'programming', 'tools'), { recursive: true });
  mkdirSync(join(TEST_DIR, '.opencode', 'scrolls', 'deep', 'nested', 'path', 'tools'), { recursive: true });

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'tools', 'root-tool.ts'),
    `export const description = "Root level tool";
export const parameters = { name: { type: 'string', required: true } };
export default async ({ name }) => ({ greeting: \`Hello \${name}\` });`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'tools', 'apollo.ts'),
    `import { defineTool } from '../../../../../../src/captain-tool';
export default defineTool({
  description: "Apollo marketing tool",
  parameters: {
    query: { type: 'string', required: true },
    limit: { type: 'number', default: 10 }
  },
  execute: async ({ query, limit }) => ({ results: [], query, limit })
});`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'tools', 'telegram.ts'),
    `export const description = "Telegram parser";
export default async () => ({ parsed: true });`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'audience-research', 'tools', 'special.ts'),
    `export const description = "Workflow-specific special tool";
export const parameters = { target: { type: 'string', required: true } };
export default async ({ target }) => ({ analyzed: target });`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'programming', 'tools', 'screenshot.ts'),
    `export const description = "Screenshot tool";
export default async () => ({ screenshot: "base64..." });`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'programming', 'tools', 'apollo.ts'),
    `export const description = "Different apollo in programming";
export default async () => ({ type: "programming" });`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'tools', '_utils.ts'),
    `export const helper = () => "should be ignored";`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'tools', 'readme.md'),
    `# Should be ignored - not a .ts file`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'deep', 'nested', 'path', 'tools', 'deep-tool.ts'),
    `export const description = "Deep nested tool";
export default async () => ({ deep: true });`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'tools', 'throws.ts'),
    `export const description = "Tool that throws";
export default async () => { throw new Error("Intentional failure"); };`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'tools', 'malformed.ts'),
    `export const description = "No default export";
export const notDefault = () => {};`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'tools', 'async-delay.ts'),
    `export const description = "Async tool with delay";
export default async () => {
  await new Promise(r => setTimeout(r, 50));
  return { delayed: true };
};`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'marketing', 'audience-research.md'),
    `# Audience Research workflow`
  );

  writeFileSync(
    join(TEST_DIR, '.opencode', 'scrolls', 'simple-task.md'),
    `# Simple task workflow`
  );
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe('defineTool', () => {
  test('creates tool definition with __isCaptainTool flag', () => {
    const tool = defineTool({
      description: 'Test tool',
      parameters: { foo: { type: 'string', required: true } },
      execute: async () => ({}),
    });
    expect(tool.__isCaptainTool).toBe(true);
    expect(tool.description).toBe('Test tool');
    expect(tool.parameters.foo.type).toBe('string');
  });

  test('parameters are optional', () => {
    const tool = defineTool({
      description: 'No params tool',
      execute: async () => 'ok',
    });
    expect(tool.parameters).toEqual({});
  });
});

describe('discoverTools', () => {
  test('finds tools in root scrolls/tools/', () => {
    const tools = discoverTools(TEST_DIR);
    const rootTool = tools.find((t) => t.path === 'root-tool');
    expect(rootTool).toBeDefined();
    expect(rootTool?.category).toBeNull();
  });

  test('finds tools in scrolls/category/tools/', () => {
    const tools = discoverTools(TEST_DIR);
    const apollo = tools.find((t) => t.path === 'marketing/apollo');
    expect(apollo).toBeDefined();
    expect(apollo?.category).toBe('marketing');
    expect(apollo?.workflow).toBeNull();
  });

  test('finds tools in scrolls/category/workflow/tools/', () => {
    const tools = discoverTools(TEST_DIR);
    const special = tools.find((t) => t.path === 'marketing/audience-research/special');
    expect(special).toBeDefined();
    expect(special?.category).toBe('marketing');
    expect(special?.workflow).toBe('audience-research');
  });

  test('ignores files starting with _', () => {
    const tools = discoverTools(TEST_DIR);
    const utils = tools.find((t) => t.name === '_utils');
    expect(utils).toBeUndefined();
  });

  test('ignores non-.ts files', () => {
    const tools = discoverTools(TEST_DIR);
    const readme = tools.find((t) => t.name === 'readme');
    expect(readme).toBeUndefined();
  });

  test('handles 3+ level nesting', () => {
    const tools = discoverTools(TEST_DIR);
    const deep = tools.find((t) => t.path === 'deep/nested/path/deep-tool');
    expect(deep).toBeDefined();
  });

  test('two tools with same name in different categories dont collide', () => {
    const tools = discoverTools(TEST_DIR);
    const marketingApollo = tools.find((t) => t.path === 'marketing/apollo');
    const programmingApollo = tools.find((t) => t.path === 'programming/apollo');
    expect(marketingApollo).toBeDefined();
    expect(programmingApollo).toBeDefined();
    expect(marketingApollo?.filePath).not.toBe(programmingApollo?.filePath);
  });
});

describe('discoverToolsForWorkflow', () => {
  test('returns category tools for category workflow', () => {
    const tools = discoverToolsForWorkflow(TEST_DIR, 'marketing/competitor-analysis');
    const apollo = tools.find((t) => t.name === 'apollo');
    expect(apollo).toBeDefined();
  });

  test('returns both category and workflow-specific tools', () => {
    const tools = discoverToolsForWorkflow(TEST_DIR, 'marketing/audience-research');
    const apollo = tools.find((t) => t.name === 'apollo');
    const special = tools.find((t) => t.name === 'special');
    expect(apollo).toBeDefined();
    expect(special).toBeDefined();
  });

  test('returns root tools for root workflow', () => {
    const tools = discoverToolsForWorkflow(TEST_DIR, 'simple-task');
    const rootTool = tools.find((t) => t.name === 'root-tool');
    expect(rootTool).toBeDefined();
  });
});

describe('resolveTool', () => {
  test('resolves category tool', async () => {
    const result = await resolveTool(TEST_DIR, 'marketing/telegram');
    expect(isToolError(result)).toBe(false);
    if (!isToolError(result)) {
      expect(result.description).toBe('Telegram parser');
    }
  });

  test('resolves workflow-specific tool', async () => {
    const result = await resolveTool(TEST_DIR, 'marketing/audience-research/special');
    expect(isToolError(result)).toBe(false);
    if (!isToolError(result)) {
      expect(result.description).toBe('Workflow-specific special tool');
    }
  });

  test('returns error for nonexistent tool', async () => {
    const result = await resolveTool(TEST_DIR, 'nonexistent/tool');
    expect(isToolError(result)).toBe(true);
    if (isToolError(result)) {
      expect(result.error).toContain('Tool not found');
    }
  });

  test('returns error for tool without default export', async () => {
    const result = await resolveTool(TEST_DIR, 'marketing/malformed');
    expect(isToolError(result)).toBe(true);
    if (isToolError(result)) {
      expect(result.error).toContain('does not export');
    }
  });
});

describe('validateParams', () => {
  test('returns error for missing required param', () => {
    const result = validateParams(
      { name: { type: 'string', required: true } },
      {}
    );
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Missing required parameters: name');
    }
  });

  test('applies default values for optional params', () => {
    const result = validateParams(
      { limit: { type: 'number', default: 10 } },
      {}
    );
    expect('valid' in result).toBe(true);
    if ('valid' in result) {
      expect(result.params.limit).toBe(10);
    }
  });

  test('validates type mismatch', () => {
    const result = validateParams(
      { count: { type: 'number', required: true } },
      { count: 'not a number' }
    );
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('expected number, got string');
    }
  });

  test('validates enum values', () => {
    const result = validateParams(
      { env: { type: 'string', required: true, enum: ['dev', 'prod'] } },
      { env: 'staging' }
    );
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('must be one of');
    }
  });
});

describe('tool execution', () => {
  test('executes tool and returns result', async () => {
    const result = await resolveTool(TEST_DIR, 'marketing/telegram');
    expect(isToolError(result)).toBe(false);
    if (!isToolError(result)) {
      const execResult = await result.execute({});
      expect(execResult).toEqual({ parsed: true });
    }
  });

  test('tool that throws returns error with stack', async () => {
    const result = await resolveTool(TEST_DIR, 'marketing/throws');
    expect(isToolError(result)).toBe(false);
    if (!isToolError(result)) {
      try {
        await result.execute({});
        expect(true).toBe(false);
      } catch (err) {
        expect(err instanceof Error).toBe(true);
        expect((err as Error).message).toContain('Intentional failure');
      }
    }
  });

  test('async tool execution awaited properly', async () => {
    const result = await resolveTool(TEST_DIR, 'marketing/async-delay');
    expect(isToolError(result)).toBe(false);
    if (!isToolError(result)) {
      const start = Date.now();
      const execResult = await result.execute({});
      const elapsed = Date.now() - start;
      expect(execResult).toEqual({ delayed: true });
      expect(elapsed).toBeGreaterThanOrEqual(40);
    }
  });

  test('naked exports (no defineTool) works', async () => {
    const result = await resolveTool(TEST_DIR, 'root-tool');
    expect(isToolError(result)).toBe(false);
    if (!isToolError(result)) {
      expect(result.description).toBe('Root level tool');
      const execResult = await result.execute({ name: 'World' });
      expect(execResult).toEqual({ greeting: 'Hello World' });
    }
  });
});

describe('empty tools folder', () => {
  test('empty tools folder does not break discovery', () => {
    mkdirSync(join(TEST_DIR, '.opencode', 'scrolls', 'empty', 'tools'), { recursive: true });
    const tools = discoverTools(TEST_DIR);
    expect(Array.isArray(tools)).toBe(true);
  });
});
