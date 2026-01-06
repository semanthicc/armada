import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TOOLS_DIR = join(process.cwd(), 'scrolls/captain-manager/tools');

describe('Tool Generator Tools', () => {
  const TEST_ROOT = join(tmpdir(), 'tool-generator-test-' + Date.now());
  const ORIGINAL_CWD = process.cwd();

  beforeAll(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    mkdirSync(join(TEST_ROOT, '.opencode/scrolls'), { recursive: true });
    process.chdir(TEST_ROOT);
  });

  afterAll(() => {
    process.chdir(ORIGINAL_CWD);
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  test('tool_create generates valid TypeScript code', async () => {
    const createTool = (await import(join(TOOLS_DIR, 'tool_create.ts'))).default;
    
    const result = await createTool.execute({
      target: 'test-flow',
      name: 'generated-tool',
      description: 'Generated test tool',
      parameters: {
        input: { type: 'string', required: true }
      },
      code: 'return { result: args.input.toUpperCase() };'
    });

    expect(result.success).toBe(true);
    const filePath = join(TEST_ROOT, '.opencode/scrolls/test-flow/tools/generated-tool.ts');
    expect(existsSync(filePath)).toBe(true);
    
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('export const description = "Generated test tool";');
    expect(content).toContain('export const parameters = {');
    expect(content).toContain('return { result: args.input.toUpperCase() };');
  });

  test('tool_list lists generated tools', async () => {
    const listTool = (await import(join(TOOLS_DIR, 'tool_list.ts'))).default;
    const result = await listTool.execute({ target: 'test-flow' });
    
    expect(result.tools).toContain('generated-tool');
  });

  test('tool_update updates existing tool', async () => {
    const updateTool = (await import(join(TOOLS_DIR, 'tool_update.ts'))).default;
    
    await updateTool.execute({
      target: 'test-flow',
      name: 'generated-tool',
      description: 'Updated description',
      parameters: { input: { type: 'string' } },
      code: 'return "updated";'
    });

    const filePath = join(TEST_ROOT, '.opencode/scrolls/test-flow/tools/generated-tool.ts');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Updated description');
    expect(content).toContain('return "updated";');
  });

  test('tool_delete removes tool', async () => {
    const deleteTool = (await import(join(TOOLS_DIR, 'tool_delete.ts'))).default;
    
    await deleteTool.execute({
      target: 'test-flow',
      name: 'generated-tool'
    });

    const filePath = join(TEST_ROOT, '.opencode/scrolls/test-flow/tools/generated-tool.ts');
    expect(existsSync(filePath)).toBe(false);
  });
});
