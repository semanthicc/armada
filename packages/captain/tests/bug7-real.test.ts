import { describe, test, expect } from 'bun:test';
import { processMessageText, expandNestedOrders } from '../src/scrolls';
import { parseScrollFrontmatter, loadScrolls } from '../src/scrolls';
import type { Order } from '../src/scrolls';

const parseFrontmatter = parseScrollFrontmatter;
const expandNestedWorkflows = expandNestedOrders;
const loadWorkflows = loadScrolls;
type Workflow = Order;

describe('Bug 7: Real patchlog.md nested expansion', () => {
  
  test('parseFrontmatter defaults scrollInScroll to "false" when not specified', () => {
    const content = `---
automention: true
description: "Test workflow"
---
# Body`;
    
    const result = parseFrontmatter(content);
    expect(result.scrollInScroll).toBe('false');
  });

  test('loadWorkflows loads patchlog with scrollInScroll="false"', () => {
    const workflows = loadWorkflows('.');
    const patchlog = workflows.get('patchlog');
    
    expect(patchlog).toBeDefined();
    console.log(`[TEST] patchlog.scrollInScroll = "${patchlog?.scrollInScroll}" (type: ${typeof patchlog?.scrollInScroll})`);
    expect(patchlog?.scrollInScroll).toBe('false');
  });

  test('expandNestedWorkflows blocks expansion when scrollInScroll="false"', () => {
    const parentWorkflow: Workflow = {
      promptType: 'scroll',
      name: 'patchlog',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnFor: [],
      description: 'test',
      automention: 'false',
      scrollInScroll: 'false',
      expand: true,
      include: [],
      includeWarnings: [],
      content: 'suggests //5-approaches for analysis',
      source: 'global',
      path: '/test',
    onLoad: []
    };

    const nestedWorkflow: Workflow = {
      promptType: 'scroll',
      name: '5-approaches',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnFor: [],
      description: 'test',
      automention: 'false',
      scrollInScroll: 'false',
      expand: true,
      include: [],
      includeWarnings: [],
      content: '# 5 Approaches content',
      source: 'global',
      path: '/test',
    onLoad: []
    };

    const workflows = new Map<string, Workflow>();
    workflows.set('patchlog', parentWorkflow);
    workflows.set('5-approaches', nestedWorkflow);

    const result = expandNestedWorkflows(
      parentWorkflow.content,
      parentWorkflow,
      workflows,
      new Map(),
      'msg123',
      {},
      { deduplicateSameMessage: true, maxNestingDepth: 3, expandOrders: true },
      [],
      0
    );

    console.log(`[TEST] Expanded content: ${result.content}`);
    console.log(`[TEST] Nested workflows found: ${result.nestedOrders}`);
    
    // Should NOT expand - content should remain unchanged
    expect(result.content).toBe('suggests //5-approaches for analysis');
    expect(result.nestedOrders.length).toBe(0);
  });

  test('expandNestedWorkflows blocks when scrollInScroll is undefined', () => {
    const parentWorkflow: Partial<Workflow> & { name: string; content: string } = {
      name: 'test',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnFor: [],
      description: 'test',
      automention: 'false',
      content: 'try //5-approaches',
      source: 'global',
      path: '/test',
    onLoad: []
    };

    const nestedWorkflow: Workflow = {
      promptType: 'scroll',
      name: '5-approaches',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnFor: [],
      description: 'test',
      automention: 'false',
      scrollInScroll: 'false',
      expand: true,
      include: [],
      includeWarnings: [],
      content: '# Content',
      source: 'global',
      path: '/test',
    onLoad: []
    };

    const workflows = new Map<string, Workflow>();
    workflows.set('test', parentWorkflow as Workflow);
    workflows.set('5-approaches', nestedWorkflow);

    const result = expandNestedWorkflows(
      parentWorkflow.content,
      parentWorkflow as Workflow,
      workflows,
      new Map(),
      'msg123',
      {},
      { deduplicateSameMessage: true, maxNestingDepth: 3, expandOrders: true },
      [],
      0
    );

    console.log(`[TEST] With undefined wiw - content: ${result.content}`);
    
    // Should NOT expand even with undefined
    expect(result.content).toBe('try //5-approaches');
    expect(result.nestedOrders.length).toBe(0);
  });

  test('REAL: processMessageText with loaded patchlog should NOT expand nested', () => {
    const workflows = loadWorkflows('.');
    const patchlog = workflows.get('patchlog');
    
    if (!patchlog) {
      console.log('[TEST] patchlog not found - skipping');
      return;
    }

    console.log(`[TEST] patchlog.scrollInScroll = "${patchlog.scrollInScroll}"`);
    console.log(`[TEST] patchlog.content contains //5-approaches: ${patchlog.content.includes('//5-approaches')}`);

    const result = processMessageText(
      '//patchlog',
      workflows,
      new Map(),
      'test-msg-123',
      {},
      { deduplicateSameMessage: true, maxNestingDepth: 3, expandOrders: true }
    );

    console.log(`[TEST] Result text (first 500 chars): ${result.text.slice(0, 500)}`);
    console.log(`[TEST] Found workflows: ${result.found}`);
    
    // Should find patchlog but NOT 5-approaches
    expect(result.found).toContain('patchlog');
    expect(result.found).not.toContain('5-approaches');
    
    // The output should NOT contain <workflow name="5-approaches"
    expect(result.text).not.toContain('<workflow name="5-approaches"');
  });
});
