import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TOOLS_DIR = join(process.cwd(), 'scrolls/captain-manager/tools');

describe('Captain Manager Tools', () => {
  const TEST_ROOT = join(tmpdir(), 'captain-manager-test-' + Date.now());
  const ORIGINAL_CWD = process.cwd();

  beforeAll(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    mkdirSync(join(TEST_ROOT, '.opencode', 'scrolls'), { recursive: true });
    process.chdir(TEST_ROOT);
  });

  afterAll(() => {
    process.chdir(ORIGINAL_CWD);
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  test('resource_create creates a workflow', async () => {
    const createTool = (await import(join(TOOLS_DIR, 'resource_create.ts'))).default;
    
    const result = await createTool.execute({
      type: 'workflow',
      name: 'test-flow',
      content: '---\ntags: [test]\n---\n# Test Flow'
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.opencode/scrolls/test-flow.md'))).toBe(true);
  });

  test('resource_create creates a namespaced workflow', async () => {
    const createTool = (await import(join(TOOLS_DIR, 'resource_create.ts'))).default;
    
    const result = await createTool.execute({
      type: 'workflow',
      name: 'marketing/test-flow',
      content: '# Namespaced'
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.opencode/scrolls/marketing/test-flow.md'))).toBe(true);
  });

  test('resource_read reads a workflow', async () => {
    const readTool = (await import(join(TOOLS_DIR, 'resource_read.ts'))).default;
    
    const result = await readTool.execute({
      name: 'test-flow'
    });

    expect(result.name).toBe('test-flow');
    expect(result.content).toContain('# Test Flow');
  });

  test('resource_update updates content', async () => {
    const updateTool = (await import(join(TOOLS_DIR, 'resource_update.ts'))).default;
    
    const result = await updateTool.execute({
      name: 'test-flow',
      content: '# Updated Flow'
    });

    expect(result.success).toBe(true);
    const content = readFileSync(join(TEST_ROOT, '.opencode/scrolls/test-flow.md'), 'utf-8');
    expect(content).toBe('# Updated Flow');
  });

  test('resource_delete deletes workflow', async () => {
    const deleteTool = (await import(join(TOOLS_DIR, 'resource_delete.ts'))).default;
    
    const result = await deleteTool.execute({
      name: 'test-flow'
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.opencode/scrolls/test-flow.md'))).toBe(false);
  });

  test('resource_list lists workflows', async () => {
    const createTool = (await import(join(TOOLS_DIR, 'resource_create.ts'))).default;
    await createTool.execute({ name: 'list-me', content: '---\ntags: [listable]\n---', type: 'workflow' });
    
    const listTool = (await import(join(TOOLS_DIR, 'resource_list.ts'))).default;
    
    const items = await listTool.execute({ type: 'workflow' }) as Array<{ name: string; tags: string[] }>;
    const found = items.find((i) => i.name === 'list-me');
    
    expect(found).toBeDefined();
    expect(found?.tags).toContain('listable');
  });
});
