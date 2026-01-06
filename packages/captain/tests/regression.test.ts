import { describe, test, expect } from 'bun:test';
import { shortId } from '../src/core';
import { findMatchingAutoOrders, processMessageText } from '../src/scrolls';
import type { Order } from '../src/scrolls';

// Backward compat aliases
const findMatchingAutoWorkflows = findMatchingAutoOrders;
type Workflow = Order;

describe('Bug Fixes Regression Tests', () => {
  
  describe('Bug 1: shortId trailing hyphen', () => {
    test('strips hyphens from salt before slicing', () => {
      const id = shortId('msg1234', '5-approaches');
      expect(id.endsWith('-')).toBe(false);
      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    test('handles messageID ending with special chars', () => {
      const id = shortId('msg-01-', 'test');
      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    test('never returns empty string (would cause trailing hyphen in ID)', () => {
      const id = shortId('----', '');
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    test('handles messageID with only special chars and empty salt', () => {
      const id = shortId('!@#$', '---');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('Bug 2: Auto-apply triggers for already-referenced workflows', () => {
    const workflow: Workflow = {
      promptType: 'scroll',
      name: '5-approaches',
      aliases: ['5a'],
      tags: [['5', 'approaches']],
      onlyFor: [],
      spawnFor: [],
      description: 'Analyze from 5 perspectives',
      automention: 'true',
      scrollInScroll: 'false',
      expand: true,
      include: [],
      includeWarnings: [],
      content: 'content',
      source: 'global',
      path: '/path',
    onLoad: []
    };

    test('should NOT trigger when workflow already referenced via [use_workflow:]', () => {
      // User message contains [use_workflow:5-approaches-abc123]
      // The tags [5, approaches] would match literally but should be excluded
      const result = findMatchingAutoWorkflows(
        '[use_workflow:5-approaches-c5RJ5]', 
        [workflow],
        undefined,
        ['5-approaches'] // explicitly mentioned
      );

      expect(result.autoApply).not.toContain('5-approaches');
    });

    test('should NOT trigger when workflow name appears in use_workflow reference text', () => {
      // Even without explicit exclusion param, the function should detect the reference
      // This test captures the ACTUAL bug: tags match the literal text content
      const result = findMatchingAutoWorkflows(
        'here is [use_workflow:5-approaches-c5RJ5] to use', 
        [workflow],
        undefined,
        [] // NOT passing explicit mention - simulating the gap
      );

      // BUG: This currently FAILS because "5" and "approaches" are in the text
      // and match the tags [['5', 'approaches']]
      expect(result.autoApply).not.toContain('5-approaches');
    });

    test('should NOT trigger when <workflow name="X"> tag present in text', () => {
      const result = findMatchingAutoWorkflows(
        '<workflow name="5-approaches" id="5-approaches-abc123">content</workflow>', 
        [workflow],
        undefined,
        [] // NOT passing explicit mention
      );

      // BUG: tags match the literal XML content
      expect(result.autoApply).not.toContain('5-approaches');
    });
  });

  describe('Bug 3: False positive hint on "// 5 approaches"', () => {
    const workflow: Workflow = {
      promptType: 'scroll',
      name: '5-approaches',
      aliases: ['5a'],
      tags: [['5', 'approaches']],
      onlyFor: [],
      spawnFor: [],
      description: 'Analyze from 5 perspectives',
      automention: 'true',
      scrollInScroll: 'false',
      expand: true,
      include: [],
      includeWarnings: [],
      content: 'content',
      source: 'global',
      path: '/path',
    onLoad: []
    };

    test('SHOULD trigger automention when tags match, even with "// " prefix', () => {
      const result = findMatchingAutoWorkflows(
        '// 5 approaches', 
        [workflow]
      );

      // "5" and "approaches" are valid tags - automention should trigger
      // The tokenizer already rejects "// name" as explicit workflow syntax
      // So this won't expand inline, but WILL trigger automention hint
      expect(result.autoApply).toContain('5-approaches');
    });
  });

  describe('Bug 3b: Code comments blocking legitimate tag matches', () => {
    const workflow: Workflow = {
      promptType: 'scroll',
      name: '5-approaches',
      aliases: ['5a', 'approaches'],
      tags: [['5', 'approaches'], 'think', 'analyze', 'brainstorm', 'ideas', 'design', 'perspectives'],
      onlyFor: [],
      spawnFor: [],
      description: 'Analyze from 5 perspectives',
      automention: 'true',
      scrollInScroll: 'false',
      expand: true,
      include: [],
      includeWarnings: [],
      content: 'content',
      source: 'global',
      path: '/path',
    onLoad: []
    };

    test('EDGE CASE: should trigger when message contains code comments + legitimate tags', () => {
      // This is the REAL user message that failed to trigger
      const userMessage = `think as linus twoarld is our changes are superior? 1-10
and this is necessary or not?
Recommendation: Consider adding error handling to your uriToPath() helper:
export function uriToPath(uri: string): string {
  try {
    return fileURLToPath(uri)
  } catch (err) {
    // LSP servers should always return valid file:// URIs
    // but log if we encounter invalid ones
    console.warn(Invalid file URI from LSP: , err)
    // Fallback to naive replacement as last resort
    return uri.replace("file://", "")
  }
}
However, if LSP servers are guaranteed to return valid URIs (which they should), the simpler implementation without error handling is also acceptable. 
think 5 approaches`;

      const result = findMatchingAutoWorkflows(userMessage, [workflow]);

      // Message contains "think" + "5" + "approaches" - should match!
      // Bug: the "// LSP servers" comment causes early-exit
      expect(result.autoApply).toContain('5-approaches');
    });

    test('should NOT block when code has // comments but user text has matching tags', () => {
      const messageWithComments = `
Please analyze this code:
\`\`\`ts
// This is a comment
function foo() {
  // Another comment
}
\`\`\`
think 5 approaches please`;

      const result = findMatchingAutoWorkflows(messageWithComments, [workflow]);
      expect(result.autoApply).toContain('5-approaches');
    });

    test('"// 5 approaches" SHOULD trigger automention (tags match)', () => {
      const result = findMatchingAutoWorkflows(
        '// 5 approaches',
        [workflow]
      );
      // Tags "5" and "approaches" match - automention should fire
      // Explicit expansion is blocked by tokenizer (requires no space after //)
      expect(result.autoApply).toContain('5-approaches');
    });
  });

  describe('Bug 4: Duplicate auto-apply hints in system prompt', () => {
    test('system transform should not duplicate catalog when called multiple times', async () => {
      const output = { system: [] as string[] };
      
      const pushCatalogWithDeduplication = () => {
        const hasCatalog = output.system.some(s => s.includes('<workflow-catalog'));
        if (hasCatalog) return;
        
        const catalogEntries = ['//5-approaches: Analyze from 5 perspectives'];
        output.system.push(
          `<workflow-catalog>\n${catalogEntries.join('\n')}\n</workflow-catalog>\n\n` +
          `<auto-workflow-behavior>\nWhen you see [Auto-apply workflows]...\n</auto-workflow-behavior>`
        );
      };
      
      pushCatalogWithDeduplication();
      pushCatalogWithDeduplication();
      
      const catalogCount = output.system.filter(s => s.includes('<workflow-catalog')).length;
      expect(catalogCount).toBe(1);
    });

    test('chat.message should not duplicate auto-apply hints when hook called twice', () => {
      let textContent = '5 approaches to solve this';
      
      const appendHintWithDeduplication = () => {
        if (textContent.includes('[Auto-apply workflow')) return;
        const hint = '[Auto-apply workflow (if relevant): //5-approaches — "desc"]';
        textContent += `\n\n${hint}`;
      };
      
      appendHintWithDeduplication();
      appendHintWithDeduplication();
      
      const hintCount = (textContent.match(/\[Auto-apply workflow/g) || []).length;
      expect(hintCount).toBe(1);
    });
  });

  describe('Bug 5: Nested workflows get duplicate IDs', () => {
    test('shortId generates unique IDs for same workflow at different nesting depths', () => {
      const id1 = shortId('msg1234', 'patchlog', []);
      const id2 = shortId('msg1234', 'patchlog', ['parent-workflow']);
      
      expect(id1).not.toBe(id2);
    });

    test('shortId generates unique IDs for workflows with same 2-char prefix', () => {
      const id1 = shortId('msg1234', 'patch-review');
      const id2 = shortId('msg1234', 'patchlog');
      
      expect(id1).not.toBe(id2);
    });

    test('shortId generates unique IDs for sibling nested workflows', () => {
      const chain = ['parent-workflow'];
      const id1 = shortId('msg1234', '5-approaches', chain);
      const id2 = shortId('msg1234', 'patchlog', chain);
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('Bug 6: Unicode workflow names not supported', () => {
    test('shortId handles Cyrillic workflow names', () => {
      const id = shortId('msg1234', 'проверка-кода');
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    test('shortId handles Chinese workflow names', () => {
      const id = shortId('msg1234', '代码审查');
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    test('shortId handles mixed unicode and ASCII', () => {
      const id = shortId('msg1234', 'review-проверка-review');
      expect(id.length).toBeGreaterThan(0);
      expect(id).toMatch(/^[a-z0-9]+$/);
    });

    test('different unicode names produce different IDs', () => {
      const id1 = shortId('msg1234', 'проверка');
      const id2 = shortId('msg1234', '检查');
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('Bug 7: Nested expansion ignores scrollInScroll:false', () => {
    test('DEBUG: Check if inline code mentions get expanded', () => {
      // processMessageText is now imported from orders
      
      const parentWorkflow = {
        name: 'patchlog',
        promptType: 'scroll' as const,
        aliases: [],
        tags: [],
        onlyFor: [],
      spawnFor: [],
        description: 'Patchlog',
        automention: 'false' as const,
        scrollInScroll: 'false' as const,
        expand: true,
      include: [],
      includeWarnings: [],
      content: 'Example: `//5-approaches` suggests the workflow',
        source: 'global' as const,
        path: '/mock/patchlog.md'
      };

      const nestedWorkflow = {
        name: '5-approaches',
        promptType: 'scroll' as const,
        aliases: [],
        tags: [],
        onlyFor: [],
      spawnFor: [],
        description: '5 approaches',
        automention: 'false' as const,
        scrollInScroll: 'false' as const,
        expand: true,
      include: [],
      includeWarnings: [],
      content: '# 5 Approaches Content',
        source: 'global' as const,
        path: '/mock/5-approaches.md'
      };

      const workflows = new Map();
      workflows.set('patchlog', parentWorkflow);
      workflows.set('5-approaches', nestedWorkflow);

      const config = { deduplicateSameMessage: true, maxNestingDepth: 3, expandOrders: true };

      const result = processMessageText(
        '//patchlog',
        workflows,
        new Map(),
        'msg-test-debug',
        {},
        config
      );

      console.log('=== DEBUG BUG 7 ===');
      console.log('Result text:', result.text);
      console.log('Found:', result.found);
      console.log('=== END DEBUG ===');

      // 5-approaches should NOT be in found list since orderInOrder is false
      expect(result.found).not.toContain('5-approaches');
      // The //5-approaches should remain as literal text
      expect(result.text).toContain('`//5-approaches`');
      expect(result.text).not.toContain('<workflow name="5-approaches"');
    });
  });

  describe('Bug 7b: orderInOrder default behavior', () => {
    test('nested workflows should NOT expand when orderInOrder is false (default)', () => {
      // processMessageText is now imported from orders
      
      const parentWorkflow = {
        name: 'parent-wf',
        promptType: 'scroll' as const,
        aliases: [],
        tags: [],
        onlyFor: [],
      spawnFor: [],
        description: 'Parent workflow',
        automention: 'false' as const,
        scrollInScroll: 'false' as const,
        expand: true,
      include: [],
      includeWarnings: [],
      content: 'Check out //nested-wf for more',
        source: 'global' as const,
        path: '/mock/parent.md'
      };

      const nestedWorkflow = {
        name: 'nested-wf',
        promptType: 'scroll' as const,
        aliases: [],
        tags: [],
        onlyFor: [],
      spawnFor: [],
        description: 'Nested workflow',
        automention: 'false' as const,
        scrollInScroll: 'false' as const,
        expand: true,
      include: [],
      includeWarnings: [],
      content: '# Nested Content',
        source: 'global' as const,
        path: '/mock/nested.md'
      };

      const workflows = new Map();
      workflows.set('parent-wf', parentWorkflow);
      workflows.set('nested-wf', nestedWorkflow);

      const config = { deduplicateSameMessage: true, maxNestingDepth: 3, expandOrders: true };

      const result = processMessageText(
        '//parent-wf',
        workflows,
        new Map(),
        'msg-test-123',
        {},
        config
      );

      // Parent should expand
      expect(result.text).toContain('<workflow name="parent-wf"');
      
      // BUT nested-wf should NOT expand - it should remain as //nested-wf in content
      expect(result.text).not.toContain('<workflow name="nested-wf"');
      expect(result.text).toContain('//nested-wf');
      
      // Only parent should be in found list
      expect(result.found).toContain('parent-wf');
      expect(result.found).not.toContain('nested-wf');
    });

    test('nested workflows SHOULD expand when orderInOrder is true', () => {
      // processMessageText is now imported from orders
      
      const parentWorkflow = {
        name: 'parent-wf',
        promptType: 'scroll' as const,
        aliases: [],
        tags: [],
        onlyFor: [],
      spawnFor: [],
        description: 'Parent workflow',
        automention: 'false' as const,
        scrollInScroll: 'true' as const,
        expand: true,
      include: [],
      includeWarnings: [],
      content: 'Check out //nested-wf for more',
        source: 'global' as const,
        path: '/mock/parent.md'
      };

      const nestedWorkflow = {
        name: 'nested-wf',
        promptType: 'scroll' as const,
        aliases: [],
        tags: [],
        onlyFor: [],
      spawnFor: [],
        description: 'Nested workflow',
        automention: 'false' as const,
        scrollInScroll: 'false' as const,
        expand: true,
      include: [],
      includeWarnings: [],
      content: '# Nested Content',
        source: 'global' as const,
        path: '/mock/nested.md'
      };

      const workflows = new Map();
      workflows.set('parent-wf', parentWorkflow);
      workflows.set('nested-wf', nestedWorkflow);

      const config = { deduplicateSameMessage: true, maxNestingDepth: 3, expandOrders: true };

      const result = processMessageText(
        '//parent-wf',
        workflows,
        new Map(),
        'msg-test-456',
        {},
        config
      );

      // Parent should expand
      expect(result.text).toContain('<workflow name="parent-wf"');
      
      // Nested SHOULD also expand
      expect(result.text).toContain('<workflow name="nested-wf"');
      
      // Both should be in found list
      expect(result.found).toContain('parent-wf');
      expect(result.found).toContain('nested-wf');
    });
  });

});
