import { describe, test, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CLI_PATH = join(import.meta.dir, '../bin/captain.ts');
const GLOBAL_WORKFLOWS_DIR = join(homedir(), '.config', 'opencode', 'workflows');
const PROJECT_DIR = join(import.meta.dir, 'fixtures', 'test-project');
const PROJECT_WORKFLOWS_DIR = join(PROJECT_DIR, '.opencode', 'workflows');

async function runCLI(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI_PATH, ...args], {
    cwd: cwd ?? PROJECT_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  
  return { stdout, stderr, exitCode };
}

describe('Captain CLI', () => {
  beforeAll(() => {
    mkdirSync(PROJECT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(PROJECT_DIR)) {
      rmSync(PROJECT_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    const testWorkflows = [
      join(GLOBAL_WORKFLOWS_DIR, 'test-global-flow.md'),
      join(PROJECT_WORKFLOWS_DIR, 'test-project-flow.md'),
    ];
    for (const path of testWorkflows) {
      if (existsSync(path)) rmSync(path);
    }
  });

  describe('help', () => {
    test('shows help with --help flag', async () => {
      const { stdout, exitCode } = await runCLI(['--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Captain CLI');
      expect(stdout).toContain('USAGE:');
    });

    test('shows help with no arguments', async () => {
      const { stdout, exitCode } = await runCLI([]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Captain CLI');
    });
  });

  describe('create workflow', () => {
    test('creates workflow in global scope by default', async () => {
      const { stdout, exitCode } = await runCLI([
        'create', 'workflow', 'test-global-flow',
        '--content', '# Test Global',
        '--description', 'A test workflow',
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Created workflow');
      expect(stdout).toContain('test-global-flow');
      
      const filePath = join(GLOBAL_WORKFLOWS_DIR, 'test-global-flow.md');
      expect(existsSync(filePath)).toBe(true);
      
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('description: A test workflow');
      expect(content).toContain('# Test Global');
    });

    test('creates workflow in project scope when specified', async () => {
      const { stdout, exitCode } = await runCLI([
        'create', 'workflow', 'test-project-flow',
        '--content', '# Test Project',
        '--scope', 'project',
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Created workflow');
      expect(stdout).toContain('test-project-flow');
      expect(stdout).toContain('.opencode');
      
      const filePath = join(PROJECT_WORKFLOWS_DIR, 'test-project-flow.md');
      expect(existsSync(filePath)).toBe(true);
    });

    test('normalizes shortcuts array', async () => {
      const { exitCode } = await runCLI([
        'create', 'workflow', 'test-global-flow',
        '--shortcuts', 'tgf, test, [grouped, tags]',
      ]);
      
      expect(exitCode).toBe(0);
      
      const filePath = join(GLOBAL_WORKFLOWS_DIR, 'test-global-flow.md');
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('shortcuts: [tgf, test, [grouped, tags]]');
    });

    test('rejects duplicate workflow name', async () => {
      await runCLI(['create', 'workflow', 'test-global-flow', '--content', '# First']);
      
      const { stderr, exitCode } = await runCLI([
        'create', 'workflow', 'test-global-flow',
        '--content', '# Duplicate',
      ]);
      
      expect(exitCode).toBe(1);
      expect(stderr).toContain('already exists');
    });
  });

  describe('list workflow', () => {
    test('lists ONLY global workflows when --scope global', async () => {
      await runCLI(['create', 'workflow', 'test-global-flow', '--content', '# Global']);
      await runCLI(['create', 'workflow', 'test-project-flow', '--content', '# Project', '--scope', 'project']);
      
      const { stdout, exitCode } = await runCLI(['list', 'workflow', '--scope', 'global']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('GLOBAL');
      expect(stdout).toContain('test-global-flow');
      expect(stdout).not.toContain('PROJECT');
      expect(stdout).not.toContain('test-project-flow');
    });

    test('lists ONLY project workflows when --scope project', async () => {
      await runCLI(['create', 'workflow', 'test-global-flow', '--content', '# Global']);
      await runCLI(['create', 'workflow', 'test-project-flow', '--content', '# Project', '--scope', 'project']);
      
      const { stdout, exitCode } = await runCLI(['list', 'workflow', '--scope', 'project']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('PROJECT');
      expect(stdout).toContain('test-project-flow');
      expect(stdout).not.toContain('GLOBAL');
      expect(stdout).not.toContain('test-global-flow');
    });

    test('lists both scopes when no --scope specified', async () => {
      await runCLI(['create', 'workflow', 'test-global-flow', '--content', '# Global']);
      await runCLI(['create', 'workflow', 'test-project-flow', '--content', '# Project', '--scope', 'project']);
      
      const { stdout, exitCode } = await runCLI(['list', 'workflow']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('GLOBAL');
      expect(stdout).toContain('test-global-flow');
      expect(stdout).toContain('PROJECT');
      expect(stdout).toContain('test-project-flow');
    });
  });

  describe('delete workflow', () => {
    test('deletes workflow from correct scope', async () => {
      await runCLI(['create', 'workflow', 'test-global-flow', '--content', '# Global']);
      
      const filePath = join(GLOBAL_WORKFLOWS_DIR, 'test-global-flow.md');
      expect(existsSync(filePath)).toBe(true);
      
      const { stdout, exitCode } = await runCLI(['delete', 'workflow', 'test-global-flow']);
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Deleted');
      expect(existsSync(filePath)).toBe(false);
    });

    test('fails when workflow not found', async () => {
      const { stderr, exitCode } = await runCLI(['delete', 'workflow', 'nonexistent-flow']);
      
      expect(exitCode).toBe(1);
      expect(stderr).toContain('not found');
    });
  });

  describe('rename workflow', () => {
    test('renames workflow', async () => {
      await runCLI(['create', 'workflow', 'test-global-flow', '--content', '# Original']);
      
      const { stdout, exitCode } = await runCLI([
        'rename', 'workflow', 'test-global-flow',
        '--newName', 'renamed-flow',
      ]);
      
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Renamed');
      
      const oldPath = join(GLOBAL_WORKFLOWS_DIR, 'test-global-flow.md');
      const newPath = join(GLOBAL_WORKFLOWS_DIR, 'renamed-flow.md');
      
      expect(existsSync(oldPath)).toBe(false);
      expect(existsSync(newPath)).toBe(true);
      
      rmSync(newPath);
    });

    test('fails without --newName', async () => {
      await runCLI(['create', 'workflow', 'test-global-flow', '--content', '# Test']);
      
      const { stderr, exitCode } = await runCLI(['rename', 'workflow', 'test-global-flow']);
      
      expect(exitCode).toBe(1);
      expect(stderr).toContain('--newName');
    });
  });
});
