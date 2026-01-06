import { describe, test, expect } from 'bun:test';
import { detectOrderMentions } from '../src/scrolls';

// Backward compat alias
const detectWorkflowMentions = detectOrderMentions;

describe('Bug 7: Regex matches inside code blocks', () => {
  test('should NOT detect mentions inside single backticks', () => {
    const text = 'Try `//5-approaches` for analysis';
    const mentions = detectWorkflowMentions(text);
    expect(mentions.length).toBe(0);
  });

  test('should NOT detect mentions inside triple backticks', () => {
    const text = '```\n//5-approaches\n```';
    const mentions = detectWorkflowMentions(text);
    expect(mentions.length).toBe(0);
  });

  test('should detect mentions outside backticks', () => {
    const text = 'Use //5-approaches here';
    const mentions = detectWorkflowMentions(text);
    expect(mentions.length).toBe(1);
    expect(mentions[0].name).toBe('5-approaches');
  });

  test('should NOT detect mentions inside <workflow> tags', () => {
    const text = '<workflow name="test-parent" id="xxx" source="project">\n# Content\nHere is //test-child\n</workflow>';
    const mentions = detectWorkflowMentions(text);
    expect(mentions.length).toBe(0);
  });

  test('should detect mentions BEFORE workflow tag but not inside', () => {
    const text = '//outside-mention then <workflow name="test">\n//inside-mention\n</workflow>';
    const mentions = detectWorkflowMentions(text);
    expect(mentions.length).toBe(1);
    expect(mentions[0].name).toBe('outside-mention');
  });
});
