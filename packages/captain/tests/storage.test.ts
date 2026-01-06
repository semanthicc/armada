import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { walkDir } from '../src/core';
import { loadOrders } from '../src/scrolls';

// Backward compat alias
const loadWorkflows = loadOrders;

describe('walkDir', () => {
  const testDir = join(tmpdir(), 'test-workflows-' + Date.now());

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'subA'), { recursive: true });
    mkdirSync(join(testDir, 'subB', 'nested'), { recursive: true });
    
    writeFileSync(join(testDir, 'root.md'), '# Root');
    writeFileSync(join(testDir, 'subA', 'fileA.md'), '# FileA');
    writeFileSync(join(testDir, 'subB', 'fileB.md'), '# FileB');
    writeFileSync(join(testDir, 'subB', 'nested', 'deep.md'), '# Deep');
    writeFileSync(join(testDir, 'ignored.txt'), 'not markdown');
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('finds all markdown files recursively', () => {
    const files = walkDir(testDir);
    const names = files.map(f => f.filePath.split(/[/\\]/).pop());
    expect(names).toContain('root.md');
    expect(names).toContain('fileA.md');
    expect(names).toContain('fileB.md');
    expect(names).toContain('deep.md');
    expect(names).not.toContain('ignored.txt');
    expect(files.length).toBe(4);
  });

  test('root files have undefined folder', () => {
    const files = walkDir(testDir);
    const rootFile = files.find(f => f.filePath.includes('root.md'));
    expect(rootFile?.folder).toBeUndefined();
  });

  test('subfolder files have folder metadata', () => {
    const files = walkDir(testDir);
    const fileA = files.find(f => f.filePath.includes('fileA.md'));
    expect(fileA?.folder).toBe('subA');
  });

  test('nested subfolder files have nested folder path', () => {
    const files = walkDir(testDir);
    const deepFile = files.find(f => f.filePath.includes('deep.md'));
    expect(deepFile?.folder).toMatch(/subB[/\\]nested/);
  });

  test('returns empty array for non-existent directory', () => {
    const files = walkDir(join(testDir, 'nonexistent'));
    expect(files).toEqual([]);
  });
});

describe('loadWorkflows folder metadata', () => {
  const testProjectDir = join(tmpdir(), 'test-project-' + Date.now());
  const workflowDir = join(testProjectDir, '.opencode', 'workflows');

  beforeAll(() => {
    mkdirSync(join(workflowDir, 'category'), { recursive: true });
    mkdirSync(join(workflowDir, 'index-cat'), { recursive: true });
    
    writeFileSync(join(workflowDir, 'test-root-wf.md'), `---
description: "Root workflow"
---
# Root`);
    
    writeFileSync(join(workflowDir, 'category', 'test-sub-wf.md'), `---
description: "Categorized workflow"
---
# Sub`);

    writeFileSync(join(workflowDir, 'index-cat', 'index.md'), '# Index Workflow');
  });

  afterAll(() => {
    if (existsSync(testProjectDir)) {
      rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  test('root workflows have undefined folder', () => {
    const workflows = loadWorkflows(testProjectDir);
    const rootWf = workflows.get('test-root-wf');
    expect(rootWf).toBeDefined();
    expect(rootWf?.folder).toBeUndefined();
  });

  test('subfolder workflows have folder metadata', () => {
    const workflows = loadWorkflows(testProjectDir);
    const subWf = workflows.get('category/test-sub-wf');
    expect(subWf).toBeDefined();
    expect(subWf?.folder).toBe('category');
  });

  test('subfolder workflows have correct path', () => {
    const workflows = loadWorkflows(testProjectDir);
    const subWf = workflows.get('category/test-sub-wf');
    expect(subWf?.path).toContain('category');
  });

  test('index.md uses folder name as workflow name', () => {
    const workflows = loadWorkflows(testProjectDir);
    const indexWf = workflows.get('index-cat');
    expect(indexWf).toBeDefined();
    expect(indexWf?.folder).toBe('index-cat');
  });
});
