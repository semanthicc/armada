import { describe, test, expect } from 'bun:test';
import { shortId } from '../src/core';
import { extractOrderReferences } from '../src/scrolls';

// Backward compat alias
const extractWorkflowReferences = extractOrderReferences;

describe('Reproduction Tests', () => {
  
  test('extractWorkflowReferences handles unbracketed reference with trailing hyphen in ID', () => {
    const text = 'use_workflow:5-approaches-t3ZW5-';
    const refs = extractWorkflowReferences(text);
    expect(refs).toContain('5-approaches');
  });

  test('shortId with 5-approaches as salt', () => {
    const id = shortId('msg1234', '5-approaches');
    // New algorithm: djb2 hash of "msg1234:5-approaches:" -> base36
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(id).not.toContain('-');
    // Deterministic: same inputs always produce same output
    expect(shortId('msg1234', '5-approaches')).toBe(id);
  });

  test('shortId with messageID ending in hyphen', () => {
    const id = shortId('msg-123-', '5-approaches');
    // New algorithm: djb2 hash preserves all input characters
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(id).not.toContain('-');
    // Different input produces different output
    expect(id).not.toBe(shortId('msg1234', '5-approaches'));
  });

});
