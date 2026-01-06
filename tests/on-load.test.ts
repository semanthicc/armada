import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseScrollFrontmatter, loadScrolls } from '../src/scrolls';
import type { Scroll } from '../src/scrolls';

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

const TEST_DIR = join(tmpdir(), 'opencode-captain-onload-test-' + Date.now());
const SCROLLS_DIR = join(TEST_DIR, '.opencode', 'scrolls');
const TOOLS_DIR = join(SCROLLS_DIR, 'test-workflow', 'tools');

describe('on_load Feature', () => {
  beforeAll(() => {
    mkdirSync(TOOLS_DIR, { recursive: true });
    
    writeFileSync(join(SCROLLS_DIR, 'test-workflow', 'index.md'), `---
description: Test workflow with on_load
on_load:
  - test-workflow/greet
  - test-workflow/setup
---
# Test Workflow
This workflow has on_load tools.
`);

    writeFileSync(join(SCROLLS_DIR, 'no-onload.md'), `---
description: Workflow without on_load
---
# No OnLoad
Regular workflow.
`);

    writeFileSync(join(SCROLLS_DIR, 'empty-onload.md'), `---
description: Workflow with empty on_load
on_load: []
---
# Empty OnLoad
Has on_load but it's empty.
`);

    writeFileSync(join(TOOLS_DIR, 'greet.ts'), `
export const description = "Greet test";
export const parameters = {};
export default async () => ({ message: "Hello from on_load!" });
`);

    writeFileSync(join(TOOLS_DIR, 'setup.ts'), `
export const description = "Setup test";
export const parameters = { config: { type: 'string', default: 'default' } };
export default async ({ config }) => ({ initialized: true, config });
`);
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('Frontmatter Parsing', () => {
    test('parses on_load array from frontmatter', () => {
      const content = `---
description: Test
on_load:
  - my-workflow/init
  - my-workflow/setup
---
Body content`;

      const result = parseScrollFrontmatter(content);
      expect(result.onLoad).toEqual(['my-workflow/init', 'my-workflow/setup']);
    });

    test('parses on_load with camelCase key', () => {
      const content = `---
description: Test
onLoad:
  - tool1
---
Body`;

      const result = parseScrollFrontmatter(content);
      expect(result.onLoad).toEqual(['tool1']);
    });

    test('returns empty array when no on_load specified', () => {
      const content = `---
description: No on_load here
---
Body`;

      const result = parseScrollFrontmatter(content);
      expect(result.onLoad).toEqual([]);
    });

    test('returns empty array for empty on_load', () => {
      const content = `---
on_load: []
---
Body`;

      const result = parseScrollFrontmatter(content);
      expect(result.onLoad).toEqual([]);
    });

    test('handles single on_load tool as string', () => {
      const content = `---
on_load: single-tool
---
Body`;

      const result = parseScrollFrontmatter(content);
      expect(result.onLoad).toEqual(['single-tool']);
    });
  });

  describe('Scroll Loading', () => {
    test('loads scroll with on_load field populated', () => {
      const scrolls = loadScrolls(TEST_DIR);
      const testWorkflow = scrolls.get('test-workflow');
      
      expect(testWorkflow).toBeDefined();
      expect(testWorkflow!.onLoad).toEqual(['test-workflow/greet', 'test-workflow/setup']);
    });

    test('scroll without on_load has empty array', () => {
      const scrolls = loadScrolls(TEST_DIR);
      const noOnload = scrolls.get('no-onload');
      
      expect(noOnload).toBeDefined();
      expect(noOnload!.onLoad).toEqual([]);
    });

    test('scroll with empty on_load has empty array', () => {
      const scrolls = loadScrolls(TEST_DIR);
      const emptyOnload = scrolls.get('empty-onload');
      
      expect(emptyOnload).toBeDefined();
      expect(emptyOnload!.onLoad).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    test('on_load with object syntax is treated as single value (user error)', () => {
      const content = `---
on_load: { invalid: yaml }
---
Body`;

      const result = parseScrollFrontmatter(content);
      expect(result.onLoad).toEqual(['{ invalid: yaml }']);
    });

    test('on_load prefers snake_case over camelCase', () => {
      const content = `---
on_load:
  - from-snake
onLoad:
  - from-camel
---
Body`;

      const result = parseScrollFrontmatter(content);
      expect(result.onLoad).toEqual(['from-snake']);
    });
  });

  describe('Timeout Utility', () => {
    test('executeWithTimeout resolves fast promises', async () => {
      const result = await executeWithTimeout(
        () => Promise.resolve('success'),
        1000
      );
      expect(result).toBe('success');
    });

    test('executeWithTimeout rejects slow promises', async () => {
      const slowPromise = () => new Promise<string>((resolve) => 
        setTimeout(() => resolve('too late'), 500)
      );
      
      await expect(executeWithTimeout(slowPromise, 50)).rejects.toThrow('Timeout after 50ms');
    });

    test('executeWithTimeout propagates errors from promise', async () => {
      const failingPromise = () => Promise.reject(new Error('original error'));
      
      await expect(executeWithTimeout(failingPromise, 1000)).rejects.toThrow('original error');
    });
  });
});
