import { describe, test, expect } from 'bun:test';
import { processMessageText, parseFrontmatter, expandNestedWorkflows } from '../src/engine';
import { loadWorkflows } from '../src/storage';
import type { Workflow } from '../src/types';

describe('Bug 7: Real patchlog.md nested expansion', () => {
  
  test('parseFrontmatter defaults workflowInWorkflow to "false" when not specified', () => {
    const content = `---
autoworkflow: true
description: "Test workflow"
---
# Body`;
    
    const result = parseFrontmatter(content);
    expect(result.workflowInWorkflow).toBe('false');
  });

  test('loadWorkflows loads patchlog with workflowInWorkflow="false"', () => {
    const workflows = loadWorkflows('.');
    const patchlog = workflows.get('patchlog');
    
    expect(patchlog).toBeDefined();
    console.log(`[TEST] patchlog.workflowInWorkflow = "${patchlog?.workflowInWorkflow}" (type: ${typeof patchlog?.workflowInWorkflow})`);
    expect(patchlog?.workflowInWorkflow).toBe('false');
  });

  test('expandNestedWorkflows blocks expansion when workflowInWorkflow="false"', () => {
    const parentWorkflow: Workflow = {
      name: 'patchlog',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'test',
      autoworkflow: 'false',
      workflowInWorkflow: 'false',
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
      autoworkflow: 'false',
      workflowInWorkflow: 'false',
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
    console.log(`[TEST] Nested workflows found: ${result.nestedWorkflows}`);
    
    // Should NOT expand - content should remain unchanged
    expect(result.content).toBe('suggests //5-approaches for analysis');
    expect(result.nestedWorkflows.length).toBe(0);
  });

  test('expandNestedWorkflows blocks when workflowInWorkflow is undefined', () => {
    const parentWorkflow: Partial<Workflow> & { name: string; content: string } = {
      name: 'test',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'test',
      autoworkflow: 'false',
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
      autoworkflow: 'false',
      workflowInWorkflow: 'false',
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
    expect(result.nestedWorkflows.length).toBe(0);
  });

  test('REAL: processMessageText with loaded patchlog should NOT expand nested', () => {
    const workflows = loadWorkflows('.');
    const patchlog = workflows.get('patchlog');
    
    if (!patchlog) {
      console.log('[TEST] patchlog not found - skipping');
      return;
    }

    console.log(`[TEST] patchlog.workflowInWorkflow = "${patchlog.workflowInWorkflow}"`);
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
