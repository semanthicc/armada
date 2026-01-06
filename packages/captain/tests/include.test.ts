import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { 
  resolveIncludePath, 
  loadIncludeContent, 
  resolveScrollIncludes 
} from '../src/scrolls/resolver';
import type { Scroll } from '../src/scrolls/types';

const TEST_DIR = join(tmpdir(), 'opencode-captain-include-test');
const SCROLLS_DIR = join(TEST_DIR, '.opencode', 'scrolls');
const DOCS_DIR = join(TEST_DIR, 'docs');

function createMockScroll(overrides: Partial<Scroll> & { name: string; path: string }): Scroll {
  return {
    promptType: 'scroll',
    aliases: [],
    tags: [],
    onlyFor: [],
    spawnFor: [],
    description: '',
    automention: 'true',
    scrollInScroll: 'false',
    expand: true,
    include: [],
    includeWarnings: [],
    content: '',
    source: 'project',
    folder: undefined,
    onLoad: [],
    ...overrides,
  };
}

describe('Include Resolution', () => {
  beforeAll(() => {
    mkdirSync(SCROLLS_DIR, { recursive: true });
    mkdirSync(DOCS_DIR, { recursive: true });
    
    writeFileSync(join(DOCS_DIR, 'api-guide.md'), '# API Guide\nThis is the API documentation.');
    writeFileSync(join(DOCS_DIR, 'security.md'), '# Security\nSecurity guidelines here.');
    writeFileSync(join(SCROLLS_DIR, 'sibling.md'), '# Sibling File\nContent from sibling.');
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('resolveIncludePath', () => {
    test('resolves relative path from scroll directory', () => {
      const scrollPath = join(SCROLLS_DIR, 'my-scroll.md');
      const result = resolveIncludePath('./sibling.md', scrollPath, TEST_DIR);
      expect(result).toBe(join(SCROLLS_DIR, 'sibling.md'));
    });

    test('resolves parent-relative path', () => {
      const scrollPath = join(SCROLLS_DIR, 'my-scroll.md');
      const result = resolveIncludePath('../docs/api-guide.md', scrollPath, TEST_DIR);
      expect(result).toContain('docs');
      expect(result).toContain('api-guide.md');
    });

    test('returns absolute path unchanged', () => {
      const absolutePath = '/absolute/path/to/file.md';
      const result = resolveIncludePath(absolutePath, join(SCROLLS_DIR, 'scroll.md'), TEST_DIR);
      expect(result).toBe(absolutePath);
    });

    test('resolves project-relative path when file exists', () => {
      const scrollPath = join(SCROLLS_DIR, 'my-scroll.md');
      const result = resolveIncludePath('docs/api-guide.md', scrollPath, TEST_DIR);
      expect(result).toBe(join(TEST_DIR, 'docs', 'api-guide.md'));
    });

    test('resolves Windows backslash relative path', () => {
      const scrollPath = join(SCROLLS_DIR, 'my-scroll.md');
      const result = resolveIncludePath('..\\docs\\api-guide.md', scrollPath, TEST_DIR);
      expect(result).toContain('docs');
      expect(result).toContain('api-guide.md');
    });

    test('resolves Windows absolute path unchanged', () => {
      const absolutePath = 'C:\\Users\\user\\Documents\\shared.md';
      const result = resolveIncludePath(absolutePath, join(SCROLLS_DIR, 'scroll.md'), TEST_DIR);
      expect(result).toBe(absolutePath);
    });
  });

  describe('loadIncludeContent', () => {
    test('loads existing file content', () => {
      const filePath = join(DOCS_DIR, 'api-guide.md');
      const result = loadIncludeContent(filePath);
      expect(result.found).toBe(true);
      expect(result.content).toContain('# API Guide');
    });

    test('returns not found for missing file', () => {
      const result = loadIncludeContent(join(TEST_DIR, 'nonexistent.md'));
      expect(result.found).toBe(false);
      expect(result.content).toBe('');
    });
  });

  describe('resolveScrollIncludes', () => {
    test('returns original content when no includes', () => {
      const scroll = createMockScroll({
        name: 'no-includes',
        path: join(SCROLLS_DIR, 'no-includes.md'),
        content: '# Original Content',
        include: [],
      });

      const result = resolveScrollIncludes(scroll, TEST_DIR);
      expect(result.content).toBe('# Original Content');
      expect(result.warnings).toHaveLength(0);
      expect(result.resolvedIncludes).toHaveLength(0);
    });

    test('merges single include before scroll content', () => {
      const scroll = createMockScroll({
        name: 'with-include',
        path: join(SCROLLS_DIR, 'with-include.md'),
        content: '# My Scroll Content',
        include: ['docs/api-guide.md'],
      });

      const result = resolveScrollIncludes(scroll, TEST_DIR);
      expect(result.content).toContain('# API Guide');
      expect(result.content).toContain('# My Scroll Content');
      expect(result.content.indexOf('API Guide')).toBeLessThan(result.content.indexOf('My Scroll'));
      expect(result.warnings).toHaveLength(0);
    });

    test('merges multiple includes in order', () => {
      const scroll = createMockScroll({
        name: 'multi-include',
        path: join(SCROLLS_DIR, 'multi-include.md'),
        content: '# Main Content',
        include: ['docs/api-guide.md', 'docs/security.md'],
      });

      const result = resolveScrollIncludes(scroll, TEST_DIR);
      const apiIndex = result.content.indexOf('API Guide');
      const securityIndex = result.content.indexOf('Security');
      const mainIndex = result.content.indexOf('Main Content');

      expect(apiIndex).toBeLessThan(securityIndex);
      expect(securityIndex).toBeLessThan(mainIndex);
    });

    test('handles missing file gracefully with warning', () => {
      const scroll = createMockScroll({
        name: 'missing-include',
        path: join(SCROLLS_DIR, 'missing-include.md'),
        content: '# Still Works',
        include: ['./nonexistent.md'],
      });

      const result = resolveScrollIncludes(scroll, TEST_DIR);
      expect(result.content).toBe('# Still Works');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Include not found');
      expect(result.warnings[0]).toContain('nonexistent.md');
    });

    test('partial success: some includes found, some missing', () => {
      const scroll = createMockScroll({
        name: 'partial-include',
        path: join(SCROLLS_DIR, 'partial-include.md'),
        content: '# Main',
        include: ['docs/api-guide.md', './missing.md'],
      });

      const result = resolveScrollIncludes(scroll, TEST_DIR);
      expect(result.content).toContain('API Guide');
      expect(result.content).toContain('# Main');
      expect(result.warnings).toHaveLength(1);
      expect(result.resolvedIncludes).toHaveLength(2);
      expect(result.resolvedIncludes[0].found).toBe(true);
      expect(result.resolvedIncludes[1].found).toBe(false);
    });
  });
});
