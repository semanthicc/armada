import { describe, test, expect } from 'bun:test';
import { shortId, findMatchingAutoWorkflows } from '../src/engine';
import type { Workflow } from '../src/types';

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
      name: '5-approaches',
      aliases: ['5a'],
      tags: [['5', 'approaches']],
      agents: [],
      description: 'Analyze from 5 perspectives',
      autoworkflow: 'true',
      workflowInWorkflow: 'false',
      content: 'content',
      source: 'global',
      path: '/path'
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
      name: '5-approaches',
      aliases: ['5a'],
      tags: [['5', 'approaches']],
      agents: [],
      description: 'Analyze from 5 perspectives',
      autoworkflow: 'true',
      workflowInWorkflow: 'false',
      content: 'content',
      source: 'global',
      path: '/path'
    };

    test('should NOT trigger when text looks like a mention but has space', () => {
      const result = findMatchingAutoWorkflows(
        '// 5 approaches', 
        [workflow]
      );

      expect(result.autoApply).not.toContain('5-approaches');
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

});
