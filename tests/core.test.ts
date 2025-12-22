import { describe, test, expect } from 'bun:test';
import { 
  normalize, 
  findBestMatch,
  findAllMatches,
  findWorkflowByName,
  detectWorkflowMentions,
  parseWorkflowArgs,
  parseFrontmatter,
  parseArrayField,
  parseTagsField,
  formatSuggestion,
  expandVariables,
  BUILTIN_VARIABLES
} from '../src/core';

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
    expect(result.autoworkflow).toBe('true');
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

  test('handles no frontmatter', () => {
    const content = '# Just markdown';
    const result = parseFrontmatter(content);
    expect(result.aliases).toEqual([]);
    expect(result.autoworkflow).toBe('false');
    expect(result.body).toBe('# Just markdown');
  });

  test('handles autoworkflow: yes', () => {
    const content = `---
autoworkflow: yes
---
body`;

    const result = parseFrontmatter(content);
    expect(result.autoworkflow).toBe('true');
  });

  test('handles autoworkflow: hintForUser', () => {
    const content = `---
autoworkflow: hintForUser
---
body`;

    const result = parseFrontmatter(content);
    expect(result.autoworkflow).toBe('hintForUser');
  });

  test('handles autoworkflow: hint (alias for hintForUser)', () => {
    const content = `---
autoworkflow: hint
---
body`;

    const result = parseFrontmatter(content);
    expect(result.autoworkflow).toBe('hintForUser');
  });

  test('handles autoworkflow: false explicitly', () => {
    const content = `---
autoworkflow: false
---
body`;

    const result = parseFrontmatter(content);
    expect(result.autoworkflow).toBe('false');
  });

  test('handles quoted description', () => {
    const content = `---
description: "Review staged git changes"
---
body`;

    const result = parseFrontmatter(content);
    expect(result.description).toBe('Review staged git changes');
  });

  test('handles agents field', () => {
    const content = `---
agents: [coder, reviewer]
---
body`;

    const result = parseFrontmatter(content);
    expect(result.agents).toEqual(['coder', 'reviewer']);
  });

  test('handles nested tag groups in frontmatter', () => {
    const content = `---
tags: [commit, [staged, changes], review]
---
body`;

    const result = parseFrontmatter(content);
    expect(result.tags).toEqual(['commit', ['staged', 'changes'], 'review']);
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
