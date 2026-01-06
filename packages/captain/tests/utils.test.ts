import { describe, test, expect } from 'bun:test';
import { normalizeArrayInput } from '../src/utils';

describe('normalizeArrayInput', () => {
  describe('basic comma-separated input', () => {
    test('simple comma-separated values', () => {
      expect(normalizeArrayInput('svelte, s5')).toEqual(['svelte', 's5']);
    });

    test('single value', () => {
      expect(normalizeArrayInput('svelte')).toEqual(['svelte']);
    });

    test('values with extra whitespace', () => {
      expect(normalizeArrayInput('  svelte ,  s5  ')).toEqual(['svelte', 's5']);
    });

    test('no spaces after comma', () => {
      expect(normalizeArrayInput('svelte,s5,tips')).toEqual(['svelte', 's5', 'tips']);
    });
  });

  describe('bracket-wrapped input (AI confusion)', () => {
    test('strips outer brackets from array-like input', () => {
      expect(normalizeArrayInput('[svelte, s5]')).toEqual(['svelte', 's5']);
    });

    test('handles [a], [b] format', () => {
      expect(normalizeArrayInput('[svelte], [s5]')).toEqual(['[svelte]', '[s5]']);
    });

    test('single value in brackets', () => {
      expect(normalizeArrayInput('[svelte]')).toEqual(['svelte']);
    });
  });

  describe('nested bracket groups (tags feature)', () => {
    test('preserves bracket groups for AND-matching tags', () => {
      expect(normalizeArrayInput('commit, [staged, changes]')).toEqual(['commit', '[staged, changes]']);
    });

    test('multiple bracket groups', () => {
      expect(normalizeArrayInput('[a, b], single, [c, d]')).toEqual(['[a, b]', 'single', '[c, d]']);
    });

    test('outer brackets with nested groups preserved as-is', () => {
      expect(normalizeArrayInput('[commit, [staged, changes], review]')).toEqual(['[commit, [staged, changes], review]']);
    });
  });

  describe('param name rejection (AI confusion)', () => {
    test('rejects param name as value - shortcuts', () => {
      expect(normalizeArrayInput('shortcuts', 'shortcuts')).toEqual([]);
    });

    test('rejects param name case-insensitive', () => {
      expect(normalizeArrayInput('SHORTCUTS', 'shortcuts')).toEqual([]);
    });

    test('rejects param name mixed with valid values', () => {
      expect(normalizeArrayInput('svelte, shortcuts, s5', 'shortcuts')).toEqual(['svelte', 's5']);
    });

    test('rejects tags param name', () => {
      expect(normalizeArrayInput('tags', 'tags')).toEqual([]);
    });
  });

  describe('empty/undefined input', () => {
    test('undefined returns empty array', () => {
      expect(normalizeArrayInput(undefined)).toEqual([]);
    });

    test('empty string returns empty array', () => {
      expect(normalizeArrayInput('')).toEqual([]);
    });

    test('whitespace-only returns empty array', () => {
      expect(normalizeArrayInput('   ')).toEqual([]);
    });

    test('empty brackets returns empty array', () => {
      expect(normalizeArrayInput('[]')).toEqual([]);
    });

    test('brackets with space returns empty array', () => {
      expect(normalizeArrayInput('[ ]')).toEqual([]);
    });
  });

  describe('edge cases', () => {
    test('trailing comma', () => {
      expect(normalizeArrayInput('a, b,')).toEqual(['a', 'b']);
    });

    test('leading comma', () => {
      expect(normalizeArrayInput(',a, b')).toEqual(['a', 'b']);
    });

    test('multiple commas', () => {
      expect(normalizeArrayInput('a,, b')).toEqual(['a', 'b']);
    });

    test('unbalanced brackets - more opens treated as single item', () => {
      expect(normalizeArrayInput('[a, [b')).toEqual(['[a, [b']);
    });

    test('unbalanced brackets - more closes treated as single item', () => {
      expect(normalizeArrayInput('a], b]')).toEqual(['a], b]']);
    });
  });
});
