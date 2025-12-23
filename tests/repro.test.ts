import { describe, test, expect } from 'bun:test';
import { extractWorkflowReferences, shortId } from '../src/engine';

describe('Reproduction Tests', () => {
  
  test('extractWorkflowReferences handles unbracketed reference with trailing hyphen in ID', () => {
    const text = 'use_workflow:5-approaches-t3ZW5-';
    const refs = extractWorkflowReferences(text);
    expect(refs).toContain('5-approaches');
  });

  test('shortId with 5-approaches as salt', () => {
    const id = shortId('msg1234', '5-approaches');
    // "5-approaches" -> "5approaches" -> "5a"
    // msg "msg1234" -> "1234"
    // Result: "12345a"
    expect(id).toBe('12345a');
    expect(id).not.toContain('-');
  });

  test('shortId with messageID ending in hyphen', () => {
    const id = shortId('msg-123-', '5-approaches');
    // Clean first: "msg-123-" -> "msg123" -> slice(-4) -> "g123"
    // Salt: "5-approaches" -> "5approaches" -> slice(0,2) -> "5a"
    // Result: "g1235a"
    expect(id).toBe('g1235a');
    expect(id).not.toContain('-');
  });

});
