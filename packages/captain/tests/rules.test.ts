import { describe, test, expect } from 'bun:test';
import {
  parseRuleFrontmatter,
  filterRulesByAgent,
  buildRulesSystemPrompt,
  processRulesForAgent,
} from '../src/rules';
import type { Rule } from '../src/rules';

function createMockRule(partial: Partial<Rule> & { name: string }): Rule {
  return {
    promptType: 'rule',
    aliases: [],
    tags: [],
    onlyFor: [],
    description: '',
    content: 'Rule content',
    source: 'global',
    path: `/mock/${partial.name}.md`,
    ...partial,
  };
}

describe('parseRuleFrontmatter', () => {
  test('parses basic frontmatter', () => {
    const content = `---
description: "Test rule"
onlyFor: [oracle, frontend]
---
Rule content here`;

    const result = parseRuleFrontmatter(content);
    expect(result.description).toBe('Test rule');
    expect(result.onlyFor).toEqual(['oracle', 'frontend']);
    expect(result.body.trim()).toBe('Rule content here');
  });

  test('handles missing frontmatter', () => {
    const content = 'Just plain content';
    const result = parseRuleFrontmatter(content);
    expect(result.aliases).toEqual([]);
    expect(result.onlyFor).toEqual([]);
    expect(result.body).toBe('Just plain content');
  });

  test('parses aliases', () => {
    const content = `---
shortcuts: [alias1, alias2]
---
Content`;

    const result = parseRuleFrontmatter(content);
    expect(result.aliases).toContain('alias1');
    expect(result.aliases).toContain('alias2');
  });
});

describe('filterRulesByAgent', () => {
  test('returns rules with empty onlyFor for any agent', () => {
    const rule1 = createMockRule({ name: 'global-rule', onlyFor: [] });
    const rule2 = createMockRule({ name: 'agent-specific', onlyFor: ['oracle'] });
    const rules = new Map<string, Rule>([
      ['global-rule', rule1],
      ['agent-specific', rule2],
    ]);

    const result = filterRulesByAgent(rules, 'frontend');
    expect(result.map(r => r.name)).toContain('global-rule');
    expect(result.map(r => r.name)).not.toContain('agent-specific');
  });

  test('returns rules matching the active agent', () => {
    const rule1 = createMockRule({ name: 'oracle-rule', onlyFor: ['oracle'] });
    const rule2 = createMockRule({ name: 'frontend-rule', onlyFor: ['frontend'] });
    const rules = new Map<string, Rule>([
      ['oracle-rule', rule1],
      ['frontend-rule', rule2],
    ]);

    const result = filterRulesByAgent(rules, 'oracle');
    expect(result.map(r => r.name)).toContain('oracle-rule');
    expect(result.map(r => r.name)).not.toContain('frontend-rule');
  });

  test('returns all rules with empty onlyFor when no agent specified', () => {
    const rule1 = createMockRule({ name: 'global-rule', onlyFor: [] });
    const rule2 = createMockRule({ name: 'agent-specific', onlyFor: ['oracle'] });
    const rules = new Map<string, Rule>([
      ['global-rule', rule1],
      ['agent-specific', rule2],
    ]);

    const result = filterRulesByAgent(rules, undefined);
    expect(result.map(r => r.name)).toContain('global-rule');
    expect(result.map(r => r.name)).not.toContain('agent-specific');
  });

  test('deduplicates rules by name', () => {
    const rule1 = createMockRule({ name: 'shared-rule', source: 'project' });
    const rule2 = createMockRule({ name: 'shared-rule', source: 'global' });
    const rules = new Map<string, Rule>([
      ['shared-rule', rule1],
      ['shared-rule-alias', rule2],
    ]);
    rules.set('shared-rule', rule1);

    const result = filterRulesByAgent(rules, undefined);
    const names = result.map(r => r.name);
    const uniqueNames = [...new Set(names)];
    expect(uniqueNames.length).toBe(names.length);
  });
});

describe('buildRulesSystemPrompt', () => {
  test('returns empty string for no rules', () => {
    const result = buildRulesSystemPrompt([]);
    expect(result).toBe('');
  });

  test('wraps rules in XML tags', () => {
    const rule = createMockRule({ name: 'test-rule', content: 'Test content' });
    const result = buildRulesSystemPrompt([rule]);
    expect(result).toContain('<rule name="test-rule"');
    expect(result).toContain('</rule>');
    expect(result).toContain('Test content');
  });

  test('includes source attribute', () => {
    const rule = createMockRule({ name: 'test-rule', source: 'project' });
    const result = buildRulesSystemPrompt([rule]);
    expect(result).toContain('source="project"');
  });

  test('formats multiple rules correctly', () => {
    const rule1 = createMockRule({ name: 'rule1', content: 'Content 1' });
    const rule2 = createMockRule({ name: 'rule2', content: 'Content 2' });
    const result = buildRulesSystemPrompt([rule1, rule2]);
    expect(result).toContain('<rule name="rule1"');
    expect(result).toContain('<rule name="rule2"');
    expect(result).toContain('Content 1');
    expect(result).toContain('Content 2');
  });
});

describe('processRulesForAgent', () => {
  test('returns empty string when no rules match', () => {
    const rule = createMockRule({ name: 'oracle-only', onlyFor: ['oracle'] });
    const rules = new Map<string, Rule>([['oracle-only', rule]]);
    const result = processRulesForAgent(rules, 'frontend');
    expect(result).toBe('');
  });

  test('returns formatted rules for matching agent', () => {
    const rule = createMockRule({ name: 'frontend-rule', onlyFor: ['frontend'], content: 'Frontend specific' });
    const rules = new Map<string, Rule>([['frontend-rule', rule]]);
    const result = processRulesForAgent(rules, 'frontend');
    expect(result).toContain('<rule name="frontend-rule"');
    expect(result).toContain('Frontend specific');
  });
});
