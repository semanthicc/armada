import { describe, test, expect } from 'bun:test';
import { highlightMatchedWords } from '../src/scrolls';

describe('highlightMatchedWords', () => {
  test('adjacent keywords wrapped together', () => {
    const result = highlightMatchedWords('5 approaches to solve', ['5', 'approaches']);
    expect(result).toBe('[5 approaches] to solve');
  });

  test('separated keywords wrapped individually', () => {
    const result = highlightMatchedWords('I have 5 different approaches', ['5', 'approaches']);
    expect(result).toBe('I have [5] different [approaches]');
  });

  test('single keyword wrapped', () => {
    const result = highlightMatchedWords('validate my staged changes', ['staged']);
    expect(result).toBe('validate my [staged] changes');
  });

  test('case insensitive matching preserves original case', () => {
    const result = highlightMatchedWords('Using APPROACHES for this', ['approaches']);
    expect(result).toBe('Using [APPROACHES] for this');
  });

  test('no matches returns unchanged text', () => {
    const result = highlightMatchedWords('hello world', ['foo', 'bar']);
    expect(result).toBe('hello world');
  });

  test('empty keywords returns unchanged text', () => {
    const result = highlightMatchedWords('hello world', []);
    expect(result).toBe('hello world');
  });

  test('keyword at start of message', () => {
    const result = highlightMatchedWords('5 ways to do this', ['5']);
    expect(result).toBe('[5] ways to do this');
  });

  test('keyword at end of message', () => {
    const result = highlightMatchedWords('think about approaches', ['approaches']);
    expect(result).toBe('think about [approaches]');
  });

  test('multiple adjacent keywords merged', () => {
    const result = highlightMatchedWords('validate my staged changes please', ['staged', 'changes']);
    expect(result).toBe('validate my [staged changes] please');
  });

  test('keywords separated by multiple words', () => {
    const result = highlightMatchedWords('commit the staged files and changes', ['staged', 'changes']);
    expect(result).toBe('commit the [staged] files and [changes]');
  });

  test('word boundaries prevent partial matches', () => {
    const result = highlightMatchedWords('approaching the 5th approach', ['approach']);
    expect(result).toBe('approaching the 5th [approach]');
  });

  test('multiple occurrences of same keyword', () => {
    const result = highlightMatchedWords('approach one and approach two', ['approach']);
    expect(result).toBe('[approach] one and [approach] two');
  });
});
