import { describe, test, expect } from 'bun:test';
import { processMessageText, expandNestedOrders } from '../src/orders';
import { parseOrderFrontmatter, loadOrders } from '../src/orders';
import type { Order } from '../src/orders';

// Backward compat aliases
const parseFrontmatter = parseOrderFrontmatter;
const expandNestedWorkflows = expandNestedOrders;
const loadWorkflows = loadOrders;
type Workflow = Order;

describe('Bug 7: Real patchlog.md nested expansion', () => {
  
  test('parseFrontmatter defaults orderInOrder to "false" when not specified', () => {
    const content = `---
automention: true
description: "Test workflow"
---
# Body`;
    
    const result = parseFrontmatter(content);
    expect(result.orderInOrder).toBe('false');
  });

  test('loadWorkflows loads patchlog with orderInOrder="false"', () => {
    const workflows = loadWorkflows('.');
    const patchlog = workflows.get('patchlog');
    
    expect(patchlog).toBeDefined();
    console.log(`[TEST] patchlog.orderInOrder = "${patchlog?.orderInOrder}" (type: ${typeof patchlog?.orderInOrder})`);
    expect(patchlog?.orderInOrder).toBe('false');
  });

  test('expandNestedWorkflows blocks expansion when orderInOrder="false"', () => {
    const parentWorkflow: Workflow = {
      name: 'patchlog',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'test',
      automention: 'false',
      orderInOrder: 'false',
      content: 'suggests //5-approaches for analysis',
      source: 'global',
      path: '/test'
    };

    const nestedWorkflow: Workflow = {
      name: '5-approaches',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'test',
      automention: 'false',
      orderInOrder: 'false',
      content: '# 5 Approaches content',
      source: 'global',
      path: '/test'
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
      { deduplicateSameMessage: true, maxNestingDepth: 3 },
      [],
      0
    );

    console.log(`[TEST] Expanded content: ${result.content}`);
    console.log(`[TEST] Nested workflows found: ${result.nestedOrders}`);
    
    // Should NOT expand - content should remain unchanged
    expect(result.content).toBe('suggests //5-approaches for analysis');
    expect(result.nestedOrders.length).toBe(0);
  });

  test('expandNestedWorkflows blocks when orderInOrder is undefined', () => {
    const parentWorkflow: Partial<Workflow> & { name: string; content: string } = {
      name: 'test',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'test',
      automention: 'false',
      content: 'try //5-approaches',
      source: 'global',
      path: '/test'
    };

    const nestedWorkflow: Workflow = {
      name: '5-approaches',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'test',
      automention: 'false',
      orderInOrder: 'false',
      content: '# Content',
      source: 'global',
      path: '/test'
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
      { deduplicateSameMessage: true, maxNestingDepth: 3 },
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

    console.log(`[TEST] patchlog.orderInOrder = "${patchlog.orderInOrder}"`);
    console.log(`[TEST] patchlog.content contains //5-approaches: ${patchlog.content.includes('//5-approaches')}`);

    const result = processMessageText(
      '//patchlog',
      workflows,
      new Map(),
      'test-msg-123',
      {},
      { deduplicateSameMessage: true, maxNestingDepth: 3 }
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
