import { describe, test, expect } from 'bun:test';
// Core module imports
import { 
  normalize, 
  findBestMatch,
  findAllMatches,
  findByName,
  parseArrayField,
  parseTagsField,
  expandVariables,
  BUILTIN_VARIABLES,
  isOrGroup,
} from '../src/core';
// Orders module imports
import {
  detectOrderMentions,
  parseOrderArgs,
  parseOrderFrontmatter,
  formatSuggestion,
  expandOrphanOrderRefs,
  extractOrderReferences,
  findMatchingAutoOrders,
  formatAutoApplyHint,
  formatUserHint,
  processMessageText,
} from '../src/scrolls';
import type { Order } from '../src/scrolls';
import type { CaptainConfig } from '../src/core/types';
// Test helpers
import { createMockOrder } from '../src/testing';

// Backward compat aliases for test readability
const findWorkflowByName = findByName;
const detectWorkflowMentions = detectOrderMentions;
const parseWorkflowArgs = parseOrderArgs;
const parseFrontmatter = parseOrderFrontmatter;
const expandOrphanWorkflowRefs = expandOrphanOrderRefs;
const extractWorkflowReferences = extractOrderReferences;
const findMatchingAutoWorkflows = findMatchingAutoOrders;
type Workflow = Order;

describe('normalize', () => {
  test('strips hyphens', () => {
    expect(normalize('5-approaches')).toBe('5approaches');
  });

  test('strips underscores', () => {
    expect(normalize('commit_review')).toBe('commitreview');
  });

  test('lowercases', () => {
    expect(normalize('5Approaches')).toBe('5approaches');
  });

  test('handles mixed delimiters and case', () => {
    expect(normalize('My_Cool-Workflow')).toBe('mycoolworkflow');
  });

  test('already clean stays same', () => {
    expect(normalize('cr')).toBe('cr');
  });

  test('empty string', () => {
    expect(normalize('')).toBe('');
  });
});

describe('findBestMatch', () => {
  const candidates = ['5-approaches', 'commit_review', 'cr', 'linus-torvalds', 'quick-fix'];

  describe('exact normalized match', () => {
    test('5approaches matches 5-approaches', () => {
      expect(findBestMatch('5approaches', candidates)).toBe('5-approaches');
    });

    test('commitreview matches commit_review', () => {
      expect(findBestMatch('commitreview', candidates)).toBe('commit_review');
    });

    test('5Approaches (case) matches 5-approaches', () => {
      expect(findBestMatch('5Approaches', candidates)).toBe('5-approaches');
    });

    test('CR uppercase matches cr', () => {
      expect(findBestMatch('CR', candidates)).toBe('cr');
    });
  });

  describe('prefix match', () => {
    test('c matches first candidate starting with c', () => {
      const result = findBestMatch('c', candidates);
      expect(result?.startsWith('c') || normalize(result!).startsWith('c')).toBe(true);
    });

    test('cr matches cr exactly when present', () => {
      expect(findBestMatch('cr', candidates)).toBe('cr');
    });

    test('5app matches 5-approaches', () => {
      expect(findBestMatch('5app', candidates)).toBe('5-approaches');
    });

    test('commit matches commit_review', () => {
      expect(findBestMatch('commit', candidates)).toBe('commit_review');
    });

    test('lin matches linus-torvalds', () => {
      expect(findBestMatch('lin', candidates)).toBe('linus-torvalds');
    });

    test('q matches quick-fix', () => {
      expect(findBestMatch('q', candidates)).toBe('quick-fix');
    });
  });

  describe('no match', () => {
    test('xyz returns null', () => {
      expect(findBestMatch('xyz', candidates)).toBeNull();
    });

    test('empty string returns null', () => {
      expect(findBestMatch('', candidates)).toBeNull();
    });

    test('partial non-prefix returns null (pproaches)', () => {
      expect(findBestMatch('pproaches', candidates)).toBeNull();
    });
  });

  describe('priority: exact over prefix', () => {
    const overlapping = ['cr', 'crab', 'create'];
    
    test('cr matches cr exactly, not crab', () => {
      expect(findBestMatch('cr', overlapping)).toBe('cr');
    });

    test('cra matches crab (prefix)', () => {
      expect(findBestMatch('cra', overlapping)).toBe('crab');
    });
  });

  describe('empty candidates', () => {
    test('returns null for empty list', () => {
      expect(findBestMatch('anything', [])).toBeNull();
    });
  });
});

describe('findAllMatches', () => {
  test('returns multiple prefix matches sorted by length', () => {
    const candidates = ['rc', 'review-calls', 'run-tests'];
    const result = findAllMatches('r', candidates);
    expect(result).toEqual(['rc', 'run-tests', 'review-calls']);
  });

  test('shortest match comes first', () => {
    const candidates = ['review-calls', 'rc', 'run-tests'];
    const result = findAllMatches('r', candidates);
    expect(result[0]).toBe('rc');
  });

  test('limits results to specified count', () => {
    const candidates = ['a1', 'a2', 'a3', 'a4', 'a5'];
    const result = findAllMatches('a', candidates, 2);
    expect(result.length).toBe(2);
  });

  test('exact matches take priority', () => {
    const candidates = ['cr', 'crab', 'create'];
    const result = findAllMatches('cr', candidates);
    expect(result).toEqual(['cr']);
  });

  test('returns empty for no matches', () => {
    const candidates = ['foo', 'bar'];
    const result = findAllMatches('xyz', candidates);
    expect(result).toEqual([]);
  });
});

describe('formatSuggestion', () => {
  test('name only when no aliases', () => {
    expect(formatSuggestion('commit-review', [])).toBe('commit-review');
  });

  test('includes aliases', () => {
    expect(formatSuggestion('commit-review', ['cr'])).toBe('commit-review (cr)');
  });

  test('multiple aliases joined with pipe', () => {
    expect(formatSuggestion('commit-review', ['cr', 'review'])).toBe('commit-review (cr | review)');
  });

  test('limits aliases to maxAliases', () => {
    const result = formatSuggestion('wf', ['a', 'b', 'c', 'd', 'e'], 2);
    expect(result).toBe('wf (a | b)');
  });
});

describe('detectWorkflowMentions', () => {
  test('detects single mention', () => {
    const result = detectWorkflowMentions('use //5-approaches for this');
    expect(result).toEqual([{ name: '5-approaches', force: false, args: {} }]);
  });

  test('detects multiple mentions', () => {
    const result = detectWorkflowMentions('//commit_review and //linus-torvalds');
    expect(result).toEqual([
      { name: 'commit_review', force: false, args: {} },
      { name: 'linus-torvalds', force: false, args: {} }
    ]);
  });

  test('detects force suffix (!)', () => {
    const result = detectWorkflowMentions('//5-approaches! reinject');
    expect(result).toEqual([{ name: '5-approaches', force: true, args: {} }]);
  });

  test('dedupes same workflow', () => {
    const result = detectWorkflowMentions('//cr then //cr again');
    expect(result).toEqual([{ name: 'cr', force: false, args: {} }]);
  });

  test('ignores URL paths', () => {
    const result = detectWorkflowMentions('visit https://example.com//path');
    expect(result).toEqual([]);
  });

  test('ignores protocol slashes', () => {
    const result = detectWorkflowMentions('file:///path');
    expect(result).toEqual([]);
  });

  test('returns empty for no mentions', () => {
    const result = detectWorkflowMentions('just normal text');
    expect(result).toEqual([]);
  });

  test('handles mention at start', () => {
    const result = detectWorkflowMentions('//cr do this');
    expect(result).toEqual([{ name: 'cr', force: false, args: {} }]);
  });

  test('handles mention at end', () => {
    const result = detectWorkflowMentions('do this //cr');
    expect(result).toEqual([{ name: 'cr', force: false, args: {} }]);
  });

  test('detects mention with args', () => {
    const result = detectWorkflowMentions('//review(file=test.ts)');
    expect(result).toEqual([{ name: 'review', force: false, args: { file: 'test.ts' } }]);
  });

  test('detects mention with multiple args', () => {
    const result = detectWorkflowMentions('//review(file=test.ts, depth=3)');
    expect(result).toEqual([{ name: 'review', force: false, args: { file: 'test.ts', depth: '3' } }]);
  });

  test('detects mention with args and force', () => {
    const result = detectWorkflowMentions('//review(depth=5)!');
    expect(result).toEqual([{ name: 'review', force: true, args: { depth: '5' } }]);
  });

  test('detects mention with quoted args', () => {
    const result = detectWorkflowMentions('//review(file="path with spaces.ts")');
    expect(result).toEqual([{ name: 'review', force: false, args: { file: 'path with spaces.ts' } }]);
  });

  test('detects mention with positional arg', () => {
    const result = detectWorkflowMentions('//review(src/index.ts)');
    expect(result).toEqual([{ name: 'review', force: false, args: { _: 'src/index.ts' } }]);
  });

  test('detects mention with quoted positional arg', () => {
    const result = detectWorkflowMentions('//review("path with spaces.ts")');
    expect(result).toEqual([{ name: 'review', force: false, args: { _: 'path with spaces.ts' } }]);
  });

  test('detects mention with positional and force', () => {
    const result = detectWorkflowMentions('//review(src/index.ts)!');
    expect(result).toEqual([{ name: 'review', force: true, args: { _: 'src/index.ts' } }]);
  });

  test('ZWSP: does NOT detect //\\u200B as workflow mention (zero-width space prevents expansion)', () => {
    // This is used in auto-apply hints to prevent self-expansion
    const result = detectWorkflowMentions('Check out //\u200B5-approaches for ideas');
    expect(result).toEqual([]);
  });

  test('ZWSP: multiple ZWSP-protected mentions are ignored', () => {
    const result = detectWorkflowMentions('//\u200Bfoo and //\u200Bbar but also //real-one');
    expect(result).toEqual([{ name: 'real-one', force: false, args: {} }]);
  });
});

describe('parseWorkflowArgs', () => {
  describe('named args', () => {
    test('parses single arg', () => {
      expect(parseWorkflowArgs('file=test.ts')).toEqual({ file: 'test.ts' });
    });

    test('parses multiple args', () => {
      expect(parseWorkflowArgs('file=test.ts, depth=3')).toEqual({ file: 'test.ts', depth: '3' });
    });

    test('parses double-quoted value with spaces', () => {
      expect(parseWorkflowArgs('file="path with spaces.ts"')).toEqual({ file: 'path with spaces.ts' });
    });

    test('parses single-quoted value', () => {
      expect(parseWorkflowArgs("name='test'")).toEqual({ name: 'test' });
    });

    test('mixed quoted and unquoted', () => {
      expect(parseWorkflowArgs('file="my file.ts", count=5')).toEqual({ file: 'my file.ts', count: '5' });
    });
  });

  describe('positional args (single value without key=)', () => {
    test('single positional becomes _', () => {
      expect(parseWorkflowArgs('src/index.ts')).toEqual({ _: 'src/index.ts' });
    });

    test('positional with spaces in quotes', () => {
      expect(parseWorkflowArgs('"path with spaces.ts"')).toEqual({ _: 'path with spaces.ts' });
    });

    test('positional with single quotes', () => {
      expect(parseWorkflowArgs("'my file.ts'")).toEqual({ _: 'my file.ts' });
    });

    test('simple word positional', () => {
      expect(parseWorkflowArgs('foo')).toEqual({ _: 'foo' });
    });

    test('number positional', () => {
      expect(parseWorkflowArgs('123')).toEqual({ _: '123' });
    });
  });

  describe('edge cases', () => {
    test('empty string returns empty object', () => {
      expect(parseWorkflowArgs('')).toEqual({});
    });

    test('undefined returns empty object', () => {
      expect(parseWorkflowArgs(undefined)).toEqual({});
    });

    test('whitespace only returns empty object', () => {
      expect(parseWorkflowArgs('   ')).toEqual({});
    });
  });
});

describe('parseArrayField', () => {
  test('parses bracket array', () => {
    expect(parseArrayField('aliases: [cr, review]', 'aliases')).toEqual(['cr', 'review']);
  });

  test('parses inline list', () => {
    expect(parseArrayField('tags: commit, git', 'tags')).toEqual(['commit', 'git']);
  });

  test('strips quotes', () => {
    expect(parseArrayField("aliases: ['cr', \"review\"]", 'aliases')).toEqual(['cr', 'review']);
  });

  test('returns empty for missing field', () => {
    expect(parseArrayField('other: value', 'aliases')).toEqual([]);
  });

  test('handles empty array', () => {
    expect(parseArrayField('aliases: []', 'aliases')).toEqual([]);
  });
});

describe('parseTagsField', () => {
  test('parses simple tags', () => {
    expect(parseTagsField('tags: [commit, review, check]')).toEqual(['commit', 'review', 'check']);
  });

  test('parses nested tag group', () => {
    expect(parseTagsField('tags: [commit, [staged, changes]]')).toEqual(['commit', ['staged', 'changes']]);
  });

  test('parses multiple nested groups', () => {
    expect(parseTagsField('tags: [[staged, changes], [think, approach]]')).toEqual([['staged', 'changes'], ['think', 'approach']]);
  });

  test('parses mixed singles and groups', () => {
    expect(parseTagsField('tags: [commit, [staged, changes], review, [think, approach]]')).toEqual([
      'commit', 
      ['staged', 'changes'], 
      'review', 
      ['think', 'approach']
    ]);
  });

  test('handles empty array', () => {
    expect(parseTagsField('tags: []')).toEqual([]);
  });

  test('handles missing field', () => {
    expect(parseTagsField('other: value')).toEqual([]);
  });

  test('strips quotes from tags', () => {
    expect(parseTagsField('tags: ["commit", \'review\']')).toEqual(['commit', 'review']);
  });

  test('handles whitespace', () => {
    expect(parseTagsField('tags: [ commit , [ staged , changes ] ]')).toEqual(['commit', ['staged', 'changes']]);
  });

  test('parses OR syntax with pipe', () => {
    expect(parseTagsField('tags: [patchnote|patchlog, commit]')).toEqual([
      { or: ['patchnote', 'patchlog'] },
      'commit'
    ]);
  });

  test('parses multiple OR groups', () => {
    expect(parseTagsField('tags: [foo|bar, baz|qux]')).toEqual([
      { or: ['foo', 'bar'] },
      { or: ['baz', 'qux'] }
    ]);
  });

  test('parses OR with three alternatives', () => {
    expect(parseTagsField('tags: [a|b|c, single]')).toEqual([
      { or: ['a', 'b', 'c'] },
      'single'
    ]);
  });

  test('mixes OR groups with AND groups', () => {
    expect(parseTagsField('tags: [foo|bar, [staged, changes], single]')).toEqual([
      { or: ['foo', 'bar'] },
      ['staged', 'changes'],
      'single'
    ]);
  });

  test('handles OR with whitespace', () => {
    expect(parseTagsField('tags: [ foo | bar , commit ]')).toEqual([
      { or: ['foo', 'bar'] },
      'commit'
    ]);
  });

  test('parses OR inside AND group: [validate|inspect, changes]', () => {
    const result = parseTagsField('tags: [[validate|inspect, changes]]');
    expect(result).toEqual([
      [{ or: ['validate', 'inspect'] }, 'changes']
    ]);
  });

  test('parses multiple OR inside AND group', () => {
    const result = parseTagsField('tags: [[foo|bar, baz|qux]]');
    expect(result).toEqual([
      [{ or: ['foo', 'bar'] }, { or: ['baz', 'qux'] }]
    ]);
  });

  test('complex: OR-in-AND mixed with simple tags', () => {
    const result = parseTagsField('tags: [simple, [validate|inspect, changes], another]');
    expect(result).toEqual([
      'simple',
      [{ or: ['validate', 'inspect'] }, 'changes'],
      'another'
    ]);
  });
});

describe('parseFrontmatter', () => {
  test('parses complete frontmatter', () => {
    const content = `---
aliases: [cr]
tags: [git, commit]
description: Review commits
autoworkflow: true
---
# Content here`;

    const result = parseFrontmatter(content);
    expect(result.aliases).toEqual(['cr']);
    expect(result.tags).toEqual(['git', 'commit']);
    expect(result.description).toBe('Review commits');
    expect(result.automention).toBe('true');
    expect(result.body).toBe('# Content here');
  });

  test('parses shortcuts as aliases', () => {
    const content = `---
shortcuts: [cr, review]
---
body`;

    const result = parseFrontmatter(content);
    expect(result.aliases).toEqual(['cr', 'review']);
  });

  test('merges aliases and shortcuts', () => {
    const content = `---
aliases: [a1]
shortcuts: [s1]
---
body`;

    const result = parseFrontmatter(content);
    expect(result.aliases).toEqual(['a1', 's1']);
  });

  test('handles no frontmatter - defaults automention to true', () => {
    const content = '# Just markdown';
    const result = parseFrontmatter(content);
    expect(result.aliases).toEqual([]);
    expect(result.automention).toBe('true');
    expect(result.body).toBe('# Just markdown');
  });

  test('handles autoworkflow: yes (backward compat)', () => {
    const content = `---
autoworkflow: yes
---
body`;

    const result = parseFrontmatter(content);
    expect(result.automention).toBe('true');
  });

  test('handles autoworkflow: hintForUser maps to true', () => {
    const content = `---
autoworkflow: hintForUser
---
body`;

    const result = parseFrontmatter(content);
    expect(result.automention).toBe('true');
  });

  test('handles autoworkflow: hint maps to true', () => {
    const content = `---
autoworkflow: hint
---
body`;

    const result = parseFrontmatter(content);
    expect(result.automention).toBe('true');
  });

  test('handles autoworkflow: false explicitly', () => {
    const content = `---
autoworkflow: false
---
body`;

    const result = parseFrontmatter(content);
    expect(result.automention).toBe('false');
  });

  test('handles quoted description', () => {
    const content = `---
description: "Review staged git changes"
---
body`;

    const result = parseFrontmatter(content);
    expect(result.description).toBe('Review staged git changes');
  });

  test('handles agents field (maps to onlyFor)', () => {
    const content = `---
agents: [coder, reviewer]
---
body`;

    const result = parseFrontmatter(content);
    expect(result.onlyFor).toEqual(['coder', 'reviewer']);
  });

  test('handles nested tag groups in frontmatter', () => {
    const content = `---
tags: [commit, [staged, changes], review]
---
body`;

    const result = parseFrontmatter(content);
    expect(result.tags).toEqual(['commit', ['staged', 'changes'], 'review']);
  });

  test('orderInOrder defaults to false', () => {
    const content = `---
description: test
---
body`;

    const result = parseFrontmatter(content);
    expect(result.orderInOrder).toBe('false');
  });

  test('orderInOrder: true (via workflowInWorkflow)', () => {
    const content = `---
workflowInWorkflow: true
---
body`;

    const result = parseFrontmatter(content);
    expect(result.orderInOrder).toBe('true');
  });

  test('orderInOrder: true (via orderInOrder)', () => {
    const content = `---
orderInOrder: true
---
body`;

    const result = parseFrontmatter(content);
    expect(result.orderInOrder).toBe('true');
  });

  test('orderInOrder: hints', () => {
    const content = `---
workflowInWorkflow: hints
---
body`;

    const result = parseFrontmatter(content);
    expect(result.orderInOrder).toBe('hints');
  });

  test('orderInOrder: hint (alias for hints)', () => {
    const content = `---
workflowInWorkflow: hint
---
body`;

    const result = parseFrontmatter(content);
    expect(result.orderInOrder).toBe('hints');
  });

  test('orderInOrder: false explicit', () => {
    const content = `---
workflowInWorkflow: false
---
body`;

    const result = parseFrontmatter(content);
    expect(result.orderInOrder).toBe('false');
  });

  test('expand defaults to true when not specified', () => {
    const content = `---
description: test
---
body`;

    const result = parseFrontmatter(content);
    expect(result.expand).toBe(true);
  });

  test('expand: false is parsed correctly', () => {
    const content = `---
expand: false
---
body`;

    const result = parseFrontmatter(content);
    expect(result.expand).toBe(false);
  });

  test('expand: true is parsed correctly', () => {
    const content = `---
expand: true
---
body`;

    const result = parseFrontmatter(content);
    expect(result.expand).toBe(true);
  });

  test('expand: no is treated as false', () => {
    const content = `---
expand: no
---
body`;

    const result = parseFrontmatter(content);
    expect(result.expand).toBe(false);
  });
});

describe('findWorkflowByName (canonical lookup)', () => {
  const workflowKeys = ['5-approaches', 'commit_review', 'cr', 'linus-torvalds'];

  describe('exact match', () => {
    test('exact name returns key', () => {
      expect(findWorkflowByName('5-approaches', workflowKeys)).toBe('5-approaches');
    });

    test('alias exact match', () => {
      expect(findWorkflowByName('cr', workflowKeys)).toBe('cr');
    });
  });

  describe('normalized match (canonicalization)', () => {
    test('5approaches matches 5-approaches', () => {
      expect(findWorkflowByName('5approaches', workflowKeys)).toBe('5-approaches');
    });

    test('5Approaches (case) matches 5-approaches', () => {
      expect(findWorkflowByName('5Approaches', workflowKeys)).toBe('5-approaches');
    });

    test('commitreview matches commit_review', () => {
      expect(findWorkflowByName('commitreview', workflowKeys)).toBe('commit_review');
    });

    test('CommitReview (case) matches commit_review', () => {
      expect(findWorkflowByName('CommitReview', workflowKeys)).toBe('commit_review');
    });

    test('linustorvalds matches linus-torvalds', () => {
      expect(findWorkflowByName('linustorvalds', workflowKeys)).toBe('linus-torvalds');
    });
  });

  describe('no match', () => {
    test('partial prefix does NOT auto-execute', () => {
      expect(findWorkflowByName('5app', workflowKeys)).toBeNull();
    });

    test('unknown returns null', () => {
      expect(findWorkflowByName('xyz', workflowKeys)).toBeNull();
    });
  });
});

describe('expandVariables', () => {
  describe('builtin {{TODAY}}', () => {
    test('replaces {{TODAY}} with current date', () => {
      const result = expandVariables('Date: {{TODAY}}');
      expect(result).toMatch(/Date: \d{4}-\d{2}-\d{2}/);
    });

    test('replaces multiple {{TODAY}} occurrences', () => {
      const result = expandVariables('{{TODAY}} and {{TODAY}}');
      const parts = result.split(' and ');
      expect(parts[0]).toBe(parts[1]);
    });

    test('{{TODAY}} format is YYYY-MM-DD', () => {
      const result = expandVariables('{{TODAY}}');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('builtin {{NOW}}', () => {
    test('replaces {{NOW}} with datetime', () => {
      const result = expandVariables('{{NOW}}');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('unknown variables', () => {
    test('leaves unknown variables untouched', () => {
      const result = expandVariables('{{UNKNOWN}} stays');
      expect(result).toBe('{{UNKNOWN}} stays');
    });

    test('handles no variables', () => {
      const result = expandVariables('plain text');
      expect(result).toBe('plain text');
    });
  });

  describe('custom resolvers', () => {
    test('uses custom resolver', () => {
      const vars = { NAME: () => 'Alice' };
      const result = expandVariables('Hello {{NAME}}', vars);
      expect(result).toBe('Hello Alice');
    });

    test('custom overrides builtin', () => {
      const vars = { TODAY: () => '1999-12-31' };
      const result = expandVariables('{{TODAY}}', vars);
      expect(result).toBe('1999-12-31');
    });

    test('handles resolver error gracefully', () => {
      const vars = { BOOM: () => { throw new Error('fail'); } };
      const result = expandVariables('{{BOOM}}', vars);
      expect(result).toBe('{{BOOM}}');
    });

    test('multiple different variables', () => {
      const vars = { A: () => '1', B: () => '2' };
      const result = expandVariables('{{A}} + {{B}} = {{C}}', vars);
      expect(result).toBe('1 + 2 = {{C}}');
    });

    test('mixes builtin and custom', () => {
      const vars = { PROJECT: () => 'my-app' };
      const result = expandVariables('{{PROJECT}} on {{TODAY}}', vars);
      expect(result).toMatch(/^my-app on \d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('BUILTIN_VARIABLES registry', () => {
    test('has TODAY resolver', () => {
      expect(BUILTIN_VARIABLES.TODAY).toBeDefined();
      expect(typeof BUILTIN_VARIABLES.TODAY()).toBe('string');
    });

    test('has NOW resolver', () => {
      expect(BUILTIN_VARIABLES.NOW).toBeDefined();
      expect(typeof BUILTIN_VARIABLES.NOW()).toBe('string');
    });
  });
});

describe('expandOrphanWorkflowRefs', () => {
  test('expands orphan [use_workflow:] reference with variable replacement', () => {
    const workflows = new Map([
      ['patchlog', {
        name: 'patchlog',
        content: 'Date: {{TODAY}}, Time: {{NOW}}',
        source: 'global' as const
      }]
    ]);
    
    const text = 'Here is the workflow: [use_workflow:patchlog-abc1]';
    const result = expandOrphanWorkflowRefs(text, workflows, {}, () => 'test');
    
    expect(result.expandedRefs).toContain('patchlog');
    expect(result.expanded).toContain('<workflow name="patchlog"');
    expect(result.expanded).not.toContain('{{TODAY}}');
    expect(result.expanded).not.toContain('{{NOW}}');
  });

  test('does not expand if full workflow already exists in text', () => {
    const workflows = new Map([
      ['patchlog', {
        name: 'patchlog',
        content: 'Content here',
        source: 'global' as const
      }]
    ]);
    
    const text = '<workflow name="patchlog">existing</workflow> and [use_workflow:patchlog-abc1]';
    const result = expandOrphanWorkflowRefs(text, workflows);
    
    expect(result.expandedRefs).toEqual([]);
    expect(result.expanded).toBe(text);
  });

  test('expands multiple orphan references', () => {
    const workflows = new Map([
      ['foo', { name: 'foo', content: 'Foo: {{TODAY}}', source: 'global' as const }],
      ['bar', { name: 'bar', content: 'Bar: {{TODAY}}', source: 'project' as const }]
    ]);
    
    const text = '[use_workflow:foo-111] and [use_workflow:bar-222]';
    const result = expandOrphanWorkflowRefs(text, workflows, {}, () => 'id');
    
    expect(result.expandedRefs).toContain('foo');
    expect(result.expandedRefs).toContain('bar');
    expect(result.expanded).toContain('<workflow name="foo"');
    expect(result.expanded).toContain('<workflow name="bar"');
    expect(result.expanded).not.toContain('{{TODAY}}');
  });

  test('uses custom context variables', () => {
    const workflows = new Map([
      ['test', {
        name: 'test',
        content: 'Project: {{PROJECT}}, Branch: {{BRANCH}}',
        source: 'global' as const
      }]
    ]);
    
    const text = '[use_workflow:test-xyz]';
    const result = expandOrphanWorkflowRefs(text, workflows, {
      PROJECT: () => 'my-project',
      BRANCH: () => 'main'
    });
    
    expect(result.expanded).toContain('Project: my-project');
    expect(result.expanded).toContain('Branch: main');
  });
});

describe('findMatchingAutoWorkflows', () => {
  const patchlogWorkflow = createMockOrder({
    name: 'patchlog',
    aliases: ['patchnote'],
    tags: [['patchlog', 'commit']],
    description: 'Generate a structured patchlog entry for documentation',
    automention: 'true'
  });

  const reviewWorkflow = createMockOrder({
    name: 'code-review',
    aliases: ['cr'],
    tags: ['review', 'code'],
    description: 'Review code changes',
    automention: 'true'
  });

  test('matches when AND group tags all present', () => {
    const result = findMatchingAutoWorkflows(
      'check my patchlog and commit changes',
      [patchlogWorkflow]
    );
    expect(result.autoApply).toContain('patchlog');
  });

  test('does NOT match when only one tag from AND group is present', () => {
    const result = findMatchingAutoWorkflows(
      'generate a patchlog for me',
      [patchlogWorkflow]
    );
    expect(result.autoApply).not.toContain('patchlog');
  });

  test('does NOT match when message contains workflow name but not enough tags', () => {
    const result = findMatchingAutoWorkflows(
      'what is patchlog',
      [patchlogWorkflow]
    );
    expect(result.autoApply).not.toContain('patchlog');
  });

  test('CRITICAL: explicit //mention should NOT trigger auto-apply for same workflow', () => {
    const result = findMatchingAutoWorkflows(
      '//patchlog',
      [patchlogWorkflow],
      undefined,
      ['patchlog']
    );
    expect(result.autoApply).not.toContain('patchlog');
  });

  test('CRITICAL: explicit mention via alias should NOT trigger auto-apply', () => {
    const result = findMatchingAutoWorkflows(
      '//patchnote generate entry',
      [patchlogWorkflow],
      undefined,
      ['patchnote']
    );
    expect(result.autoApply).not.toContain('patchlog');
  });

  test('matches other workflows even when one is explicitly mentioned', () => {
    const result = findMatchingAutoWorkflows(
      '//patchlog review my code changes',
      [patchlogWorkflow, reviewWorkflow],
      undefined,
      ['patchlog']
    );
    expect(result.autoApply).not.toContain('patchlog');
    expect(result.autoApply).toContain('code-review');
  });

  test('matches when 2+ single tags are present', () => {
    const result = findMatchingAutoWorkflows(
      'please review my code',
      [reviewWorkflow]
    );
    expect(result.autoApply).toContain('code-review');
  });

  test('does NOT match when only 1 single tag is present', () => {
    const result = findMatchingAutoWorkflows(
      'review this',
      [reviewWorkflow]
    );
    expect(result.autoApply).not.toContain('code-review');
  });

  test('BUG REGRESSION: "// patchlog" with space should NOT trigger auto-apply via name match', () => {
    const result = findMatchingAutoWorkflows(
      '// patchlog',
      [patchlogWorkflow]
    );
    expect(result.autoApply).not.toContain('patchlog');
  });

  test('BUG REGRESSION: typo "//patchlog " should not trigger when AND group incomplete', () => {
    const result = findMatchingAutoWorkflows(
      '//patchlog generate docs',
      [patchlogWorkflow],
      undefined,
      ['patchlog']
    );
    expect(result.autoApply).not.toContain('patchlog');
  });

  test('BUG REGRESSION: alias in text should NOT trigger auto-apply', () => {
    const result = findMatchingAutoWorkflows(
      'what is patchnote feature',
      [patchlogWorkflow]
    );
    expect(result.autoApply).not.toContain('patchlog');
  });

  test('BUG REGRESSION: [use_workflow:X] reference should NOT trigger auto-apply for X', () => {
    const result = findMatchingAutoWorkflows(
      'patchlog commit [use_workflow:patchlog-kF0y]',
      [patchlogWorkflow],
      undefined,
      ['patchlog']
    );
    expect(result.autoApply).not.toContain('patchlog');
  });

  test('BUG REGRESSION: <workflow name="X"> tag should NOT trigger auto-apply for X', () => {
    const result = findMatchingAutoWorkflows(
      'patchlog commit <workflow name="patchlog">content</workflow>',
      [patchlogWorkflow],
      undefined,
      ['patchlog']
    );
    expect(result.autoApply).not.toContain('patchlog');
  });
});

describe('findMatchingAutoOrders - Word Boundary Bug', () => {
  test('REAL BUG: debug_protocol should NOT match on "debugger" and "would" substrings', () => {
    // This is the EXACT user message that triggered the false positive
    const userMessage = `ok, last one = spawnWith are we spawning it also with format extended or hinted
and would be nice to add docs spawn support inside of our workflows? cuz what if i want my both debugger and frontend coder to know svelte [5] tips but then i would have to put it in both agents separatelly or more handy just in 1 workflow mention them both?
also what about synchronization? with conflict resolution so it would pickup which one was edited mentioning what agent should be spawned and in synch showcase in both agent.md and in workflow.md spawnWith / spawnFor ?
think as linus [5 approaches], is it a nice flow`;

    const debugWorkflow = createMockOrder({
      name: 'debug_protocol',
      tags: [['do', 'debug']],  // This is what the real workflow likely has
      description: 'Inspect staged changes before commit',
      automention: 'true'
    });
    
    const result = findMatchingAutoOrders(userMessage, [debugWorkflow]);
    
    // BUG: Currently this WRONGLY matches because:
    // - "would" contains "do" 
    // - "debugger" contains "debug"
    // But neither "do" nor "debug" appear as standalone words!
    expect(result.autoApply).not.toContain('debug_protocol');
  });

  test('BUG: "debug" tag should NOT match "debugger" substring', () => {
    const debugWorkflow = createMockOrder({
      name: 'debug_protocol',
      tags: ['debug'],
      description: 'Inspect staged changes',
      automention: 'true'
    });
    
    const result = findMatchingAutoOrders(
      'my debugger is broken',
      [debugWorkflow]
    );
    expect(result.autoApply).not.toContain('debug_protocol');
  });

  test('BUG: "do" tag should NOT match "would" substring', () => {
    const doWorkflow = createMockOrder({
      name: 'do-task',
      tags: ['do', 'task'],
      description: 'Do a task',
      automention: 'true'
    });
    
    const result = findMatchingAutoOrders(
      'would you help me?',
      [doWorkflow]
    );
    expect(result.autoApply).not.toContain('do-task');
  });

  test('BUG: tags in AND group should use word-boundary matching', () => {
    const debugWorkflow = createMockOrder({
      name: 'debug_protocol',
      tags: [['do', 'debug']],
      description: 'Debug protocol',
      automention: 'true'
    });
    
    // "would" contains "do", "debugger" contains "debug" - but should NOT match
    const result = findMatchingAutoOrders(
      'would you fix my debugger',
      [debugWorkflow]
    );
    expect(result.autoApply).not.toContain('debug_protocol');
  });

  test('tags should still match when used as full words', () => {
    const debugWorkflow = createMockOrder({
      name: 'debug_protocol',
      tags: ['debug', 'inspect'],
      description: 'Debug protocol',
      automention: 'true'
    });
    
    const result = findMatchingAutoOrders(
      'debug and inspect this code',
      [debugWorkflow]
    );
    expect(result.autoApply).toContain('debug_protocol');
  });
});

describe('extractWorkflowReferences', () => {
  // Using imported extractOrderReferences (aliased as extractWorkflowReferences)

  test('extracts [use_workflow:name-id] references', () => {
    const result = extractWorkflowReferences('[use_workflow:patchlog-kF0y]');
    expect(result).toContain('patchlog');
  });

  test('extracts <workflow name="X"> references', () => {
    const result = extractWorkflowReferences('<workflow name="patchlog" id="patchlog-123">content</workflow>');
    expect(result).toContain('patchlog');
  });

  test('extracts multiple references', () => {
    const result = extractWorkflowReferences('[use_workflow:foo-abc] and <workflow name="bar">x</workflow>');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  test('returns empty for no references', () => {
    const result = extractWorkflowReferences('just normal text');
    expect(result).toEqual([]);
  });

  test('deduplicates references', () => {
    const result = extractWorkflowReferences('[use_workflow:foo-1] [use_workflow:foo-2]');
    expect(result).toEqual(['foo']);
  });

  test('BUG REGRESSION: Workflow name with hyphen used as ID salt (e.g. 5-approaches) should be detected', () => {
    const weirdIdRef = '[use_workflow:5-approaches-e4v15-]';
    const result = extractWorkflowReferences(weirdIdRef);
    expect(result).toContain('5-approaches');
  });

  test('BUG REGRESSION: Unbracketed reference with trailing hyphen in ID should be detected', () => {
    const unbracketedRef = 'use_workflow:5-approaches-sIqb5-';
    const result = extractWorkflowReferences(unbracketedRef);
    expect(result).toContain('5-approaches');
  });
});

describe('Unicode workflow names', () => {
  describe('detectWorkflowMentions - Unicode support', () => {
    test('detects Cyrillic workflow name', () => {
      const result = detectWorkflowMentions('используй //код-ревью для проверки');
      expect(result).toEqual([{ name: 'код-ревью', force: false, args: {} }]);
    });

    test('detects Chinese workflow name', () => {
      const result = detectWorkflowMentions('请使用 //代码审查 来检查');
      expect(result).toEqual([{ name: '代码审查', force: false, args: {} }]);
    });

    test('detects Arabic workflow name', () => {
      const result = detectWorkflowMentions('استخدم //مراجعة-الكود');
      expect(result).toEqual([{ name: 'مراجعة-الكود', force: false, args: {} }]);
    });

    test('detects mixed Latin-Cyrillic workflow name', () => {
      const result = detectWorkflowMentions('check //review-ревью now');
      expect(result).toEqual([{ name: 'review-ревью', force: false, args: {} }]);
    });

    test('detects Unicode workflow with force suffix', () => {
      const result = detectWorkflowMentions('//код-ревью! принудительно');
      expect(result).toEqual([{ name: 'код-ревью', force: true, args: {} }]);
    });

    test('detects Unicode workflow with args', () => {
      const result = detectWorkflowMentions('//ревью(file=тест.ts)');
      expect(result).toEqual([{ name: 'ревью', force: false, args: { file: 'тест.ts' } }]);
    });

    test('detects multiple Unicode workflows', () => {
      const result = detectWorkflowMentions('//код-ревью и //анализ-безопасности');
      expect(result).toEqual([
        { name: 'код-ревью', force: false, args: {} },
        { name: 'анализ-безопасности', force: false, args: {} }
      ]);
    });

    test('dedupes same Unicode workflow', () => {
      const result = detectWorkflowMentions('//код потом //код снова');
      expect(result).toEqual([{ name: 'код', force: false, args: {} }]);
    });
  });

  describe('extractWorkflowReferences - Unicode support', () => {
    test('extracts bracketed Unicode workflow reference', () => {
      const result = extractWorkflowReferences('[use_workflow:код-ревью-abc123]');
      expect(result).toContain('код-ревью');
    });

    test('extracts unbracketed Unicode workflow reference', () => {
      const result = extractWorkflowReferences('use_workflow:代码审查-xyz789');
      expect(result).toContain('代码审查');
    });
  });

  describe('normalize - Unicode support', () => {
    test('normalizes Cyrillic workflow name', () => {
      expect(normalize('Код-Ревью')).toBe('кодревью');
    });

    test('normalizes Chinese workflow name', () => {
      expect(normalize('代码_审查')).toBe('代码审查');
    });

    test('normalizes mixed script workflow name', () => {
      expect(normalize('Review-Ревью_审查')).toBe('reviewревью审查');
    });
  });
});

describe('formatAutoApplyHint', () => {
  const mockOrder = (name: string, description: string): Order => createMockOrder({
    name,
    description,
  });

  test('wraps header in brackets', () => {
    const orders = new Map([['test', mockOrder('test', 'Test desc')]]);
    const keywords = new Map([['test', ['keyword1']]]);
    const result = formatAutoApplyHint(['test'], orders, keywords);
    expect(result.startsWith('[Important. Workflow Detected]')).toBe(true);
  });

  test('uses regular space instead of zero-width space', () => {
    const orders = new Map([['test', mockOrder('test', 'Test desc')]]);
    const keywords = new Map([['test', ['keyword1']]]);
    const result = formatAutoApplyHint(['test'], orders, keywords);
    expect(result).not.toContain('\u200B');
    expect(result).toContain('`// test`');
  });

  test('singular header for one workflow (standard theme)', () => {
    const orders = new Map([['test', mockOrder('test', 'Test desc')]]);
    const keywords = new Map<string, string[]>();
    const result = formatAutoApplyHint(['test'], orders, keywords, 'standard');
    expect(result).toContain('Workflow Detected');
  });

  test('plural header for multiple workflows (standard theme)', () => {
    const orders = new Map([
      ['test1', mockOrder('test1', 'Test 1')],
      ['test2', mockOrder('test2', 'Test 2')]
    ]);
    const keywords = new Map<string, string[]>();
    const result = formatAutoApplyHint(['test1', 'test2'], orders, keywords, 'standard');
    expect(result).toContain('Workflow Detected');
  });

  test('includes matched keywords', () => {
    const orders = new Map([['test', mockOrder('test', 'Test desc')]]);
    const keywords = new Map([['test', ['security', 'audit']]]);
    const result = formatAutoApplyHint(['test'], orders, keywords);
    expect(result).toContain('(matched: `security`, `audit`)');
  });
});

describe('formatUserHint', () => {
  test('uses regular space instead of zero-width space', () => {
    const descriptions = new Map([['test', 'Test desc']]);
    const result = formatUserHint(['test'], descriptions);
    expect(result).not.toContain('\u200B');
    expect(result).toContain('// test');
  });

  test('wraps in suggested workflows format', () => {
    const descriptions = new Map([['audit', 'Security audit']]);
    const result = formatUserHint(['audit'], descriptions);
    expect(result).toContain('[Suggested workflows:');
    expect(result).toContain('// audit');
  });
});

describe('Sequence Tag Parsing and Matching', () => {
  const { parseSequenceTag, matchesSequenceTag, hasSequenceSyntax } = require('../src/core/matcher');

  describe('hasSequenceSyntax', () => {
    test('returns true for string with ->', () => {
      expect(hasSequenceSyntax('follow->instruction')).toBe(true);
    });

    test('returns false for string without ->', () => {
      expect(hasSequenceSyntax('follow instruction')).toBe(false);
    });
  });

  describe('parseSequenceTag', () => {
    test('parses simple two-word sequence', () => {
      const result = parseSequenceTag('follow->instruction');
      expect(result.sequence).toHaveLength(2);
      expect(result.sequence[0]).toEqual({ type: 'word', values: ['follow'] });
      expect(result.sequence[1]).toEqual({ type: 'word', values: ['instruction'] });
    });

    test('parses OR group before word', () => {
      const result = parseSequenceTag('(follow|execute|do)->instruction');
      expect(result.sequence).toHaveLength(2);
      expect(result.sequence[0]).toEqual({ type: 'or', values: ['follow', 'execute', 'do'] });
      expect(result.sequence[1]).toEqual({ type: 'word', values: ['instruction'] });
    });

    test('parses word before AND group', () => {
      const result = parseSequenceTag('inspect->[changes,staged]');
      expect(result.sequence).toHaveLength(2);
      expect(result.sequence[0]).toEqual({ type: 'word', values: ['inspect'] });
      expect(result.sequence[1]).toEqual({ type: 'and', values: ['changes', 'staged'] });
    });

    test('parses chained sequence', () => {
      const result = parseSequenceTag('think->5->approaches');
      expect(result.sequence).toHaveLength(3);
      expect(result.sequence[0]).toEqual({ type: 'word', values: ['think'] });
      expect(result.sequence[1]).toEqual({ type: 'word', values: ['5'] });
      expect(result.sequence[2]).toEqual({ type: 'word', values: ['approaches'] });
    });
  });

  describe('matchesSequenceTag', () => {
    test('matches simple sequence in correct order', () => {
      const seq = parseSequenceTag('follow->instruction');
      const result = matchesSequenceTag(seq, 'please follow my instruction');
      expect(result.matches).toBe(true);
      expect(result.keywords).toContain('follow');
      expect(result.keywords).toContain('instruction');
    });

    test('does NOT match sequence in wrong order', () => {
      const seq = parseSequenceTag('follow->instruction');
      const result = matchesSequenceTag(seq, 'instruction to follow');
      expect(result.matches).toBe(false);
    });

    test('matches OR group in sequence', () => {
      const seq = parseSequenceTag('(follow|execute|do)->instruction');
      
      expect(matchesSequenceTag(seq, 'follow the instruction').matches).toBe(true);
      expect(matchesSequenceTag(seq, 'execute the instruction').matches).toBe(true);
      expect(matchesSequenceTag(seq, 'do the instruction').matches).toBe(true);
      expect(matchesSequenceTag(seq, 'instruction to follow').matches).toBe(false);
    });

    test('matches AND group after word', () => {
      const seq = parseSequenceTag('inspect->[changes,staged]');
      
      expect(matchesSequenceTag(seq, 'inspect my staged changes').matches).toBe(true);
      expect(matchesSequenceTag(seq, 'inspect changes that are staged').matches).toBe(true);
      expect(matchesSequenceTag(seq, 'changes need to be inspected').matches).toBe(false);
    });

    test('matches chained sequence', () => {
      const seq = parseSequenceTag('think->5->approaches');
      
      expect(matchesSequenceTag(seq, 'think about 5 approaches').matches).toBe(true);
      expect(matchesSequenceTag(seq, 'think of 5 different approaches').matches).toBe(true);
      expect(matchesSequenceTag(seq, '5 approaches to think about').matches).toBe(false);
    });

    test('returns matched keywords', () => {
      const seq = parseSequenceTag('(follow|execute)->instruction');
      const result = matchesSequenceTag(seq, 'execute the instruction');
      expect(result.matches).toBe(true);
      expect(result.keywords).toContain('execute');
      expect(result.keywords).toContain('instruction');
    });
  });
});

describe('processMessageText - expand option', () => {
  const defaultConfig: CaptainConfig = {
    deduplicateSameMessage: true,
    maxNestingDepth: 3,
    expandOrders: true,
  };

  const createOrder = (name: string, expand: boolean): Order => createMockOrder({
    name,
    content: `Content of ${name}`,
    expand,
  });

  test('expand:false injects hint instead of full content', () => {
    const orders = new Map([['my-order', createOrder('my-order', false)]]);
    const result = processMessageText(
      'use //my-order please',
      orders,
      new Map(),
      'msg-1',
      {},
      defaultConfig
    );
    
    expect(result.text).toContain('[//my-order → call get_workflow("my-order") to read]');
    expect(result.text).not.toContain('<workflow');
    expect(result.text).not.toContain('Content of my-order');
    expect(result.found).toContain('my-order');
  });

  test('expand:true (default) injects full content', () => {
    const orders = new Map([['my-order', createOrder('my-order', true)]]);
    const result = processMessageText(
      'use //my-order please',
      orders,
      new Map(),
      'msg-1',
      {},
      defaultConfig
    );
    
    expect(result.text).toContain('<workflow name="my-order"');
    expect(result.text).toContain('Content of my-order');
    expect(result.found).toContain('my-order');
  });

  test('config.expandOrders:false makes all orders hint-only', () => {
    const configNoExpand: CaptainConfig = { ...defaultConfig, expandOrders: false };
    const orders = new Map([['my-order', createOrder('my-order', true)]]);
    const result = processMessageText(
      'use //my-order please',
      orders,
      new Map(),
      'msg-1',
      {},
      configNoExpand
    );
    
    expect(result.text).toContain('[//my-order → call get_workflow("my-order") to read]');
    expect(result.text).not.toContain('<workflow');
  });

  test('per-order expand:false overrides config.expandOrders:true', () => {
    const orders = new Map([['my-order', createOrder('my-order', false)]]);
    const result = processMessageText(
      'use //my-order please',
      orders,
      new Map(),
      'msg-1',
      {},
      defaultConfig
    );
    
    expect(result.text).toContain('[//my-order → call get_workflow("my-order") to read]');
    expect(result.text).not.toContain('<workflow');
  });

  test('mixed orders: each respects its own expand setting', () => {
    const orders = new Map([
      ['order-expand', createOrder('order-expand', true)],
      ['order-hint', createOrder('order-hint', false)],
    ]);
    const result = processMessageText(
      'use //order-expand and //order-hint',
      orders,
      new Map(),
      'msg-1',
      {},
      defaultConfig
    );
    
    expect(result.text).toContain('<workflow name="order-expand"');
    expect(result.text).toContain('Content of order-expand');
    expect(result.text).toContain('[//order-hint → call get_workflow("order-hint") to read]');
    expect(result.text).not.toContain('<workflow name="order-hint"');
  });

  test('expand:false with deduplication: all mentions become hints (no references)', () => {
    const orders = new Map([['my-order', createOrder('my-order', false)]]);
    const result = processMessageText(
      '//my-order first, //my-order second',
      orders,
      new Map(),
      'msg-1',
      {},
      defaultConfig
    );
    
    const hintCount = (result.text.match(/\[\/\/my-order → call get_workflow/g) || []).length;
    
    expect(hintCount).toBe(2);
    expect(result.text).not.toContain('[use_workflow:');
  });
});
