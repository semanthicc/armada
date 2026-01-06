import { describe, test, expect } from 'bun:test';
import { 
  stripExistingHints, 
  stripHighlightBrackets, 
  sanitizeUserMessage,
  formatAutoApplyHint
} from '../src/scrolls';
import type { Order } from '../src/scrolls/types';

function mockOrder(name: string, desc: string): Order {
  return { name, description: desc, content: '', source: 'global', aliases: [], tags: [], onlyFor: [], automention: 'true', spawnFor: [], scrollInScroll: 'false', expand: true, include: [], includeWarnings: [], path: '', promptType: 'scroll' };
}

describe('stripExistingHints', () => {
  test('clean message without hints returns unchanged', () => {
    const text = 'think about 5 approaches';
    expect(stripExistingHints(text)).toBe(text);
  });

  test('strips complete Workflow hint at end', () => {
    const text = `think about 5 approaches

[⚡ Workflow matched]
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP
↳ \`//5-approaches\` (matched: \`5\`, \`approaches\`)  —  "Analyze problems from 5 perspectives"`;
    expect(stripExistingHints(text)).toBe('think about 5 approaches');
  });

  test('strips complete Orders hint (pirate theme)', () => {
    const text = `think about 5 approaches

[⚡ Orders matched]
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP
↳ \`//5-approaches\``;
    expect(stripExistingHints(text)).toBe('think about 5 approaches');
  });

  test('strips corrupted hint - user content after preserved', () => {
    const text = `think about 5 approaches

[⚡ Workflow matched]
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP
↳ \`//5-approaches\` (matched: \`5\`, \`approaches\`)  —  "Analyze from 5 pers
user accidentally typed here`;
    expect(stripExistingHints(text)).toBe(`think about 5 approaches

user accidentally typed here`);
  });

  test('strips partial hint cut mid-line - orphan fragment stays', () => {
    const text = `think about 5 approaches

[⚡ Workflow matched]
ACTION_RE`;
    expect(stripExistingHints(text)).toBe(`think about 5 approaches

ACTION_RE`);
  });

  test('strips minimal partial hint', () => {
    const text = `think about 5 approaches

[⚡ Workflow`;
    expect(stripExistingHints(text)).toBe('think about 5 approaches');
  });

  test('strips hint with only opening', () => {
    const text = `hello world

[⚡ Orders`;
    expect(stripExistingHints(text)).toBe('hello world');
  });

  test('case insensitive matching - non-fingerprint content preserved', () => {
    const text = `hello

[⚡ WORKFLOW MATCHED]
stuff`;
    expect(stripExistingHints(text)).toBe(`hello

stuff`);
  });

  test('REGRESSION: preserves content AFTER corrupted hint block', () => {
    const text = `my question here

[⚡ Workflow matched]
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP
↳ \`//5-approaches\` (matched: \`5\`, \`approaches\`)  —  "Analyze from 5 pers

IMPORTANT CONTENT AFTER THE HINT`;
    
    expect(stripExistingHints(text)).toBe(`my question here

IMPORTANT CONTENT AFTER THE HINT`);
  });

  test('preserves text before hint - non-fingerprint after preserved', () => {
    const text = `line 1
line 2
line 3

[⚡ Workflow matched]
hint content`;
    expect(stripExistingHints(text)).toBe(`line 1
line 2
line 3

hint content`);
  });

  test('partial header corruption + content AFTER preserved', () => {
    const text = `my question

[⚡ Work

IMPORTANT CONTENT AFTER`;
    expect(stripExistingHints(text)).toBe(`my question

IMPORTANT CONTENT AFTER`);
  });

  test('orphan lines with fingerprints ARE stripped (no header)', () => {
    const text = `my question

aches (matched: \`[5]\`, \`[approaches]\`)
↳ Desc: "Analyze problems from [5] perspectives"`;
    expect(stripExistingHints(text)).toBe('my question');
  });

  test('orphan ACTION_REQUIRED line stripped', () => {
    const text = `my question\r
\r
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP\r
↳ \`//5-approaches\``;
    expect(stripExistingHints(text)).toBe('my question');
  });

  test('orphan old format ↳ //[name] stripped', () => {
    const text = `my question

↳ \`//5-approaches\` (matched: \`5\`)`;
    expect(stripExistingHints(text)).toBe('my question');
  });

  test('strips inline description format - actual formatAutoApplyHint output', () => {
    const text = `my question\r
\r
[⚡ Workflow matched]\r
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP\r
↳ \`//5-approaches\` (matched: \`5\`, \`approaches\`)  —  "Analyze problems from 5 perspectives"`;
    
    expect(stripExistingHints(text)).toBe('my question');
  });

  test('legacy Desc format still stripped - backwards compatibility', () => {
    const text = `my question\r
\r
↳ Desc: \`Old description that survived\`\r
\r
[⚡ Workflow matched]\r
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP\r
↳ \`//5-approaches\` (matched: \`5\`, \`approaches\`)  —  "New description"`;
    
    expect(stripExistingHints(text)).toBe('my question');
  });

  test('unrecognizable fragment stays - allows clean re-append', () => {
    const corruptedMessage = `my question\r
\r
lyze problems from 5 perspectives before solving"`;
    
    const afterStrip = stripExistingHints(corruptedMessage);
    expect(afterStrip).toBe(corruptedMessage.trim());
    
    const reAppended = `${afterStrip}\r
\r
[⚡ Workflow matched]\r
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP\r
↳ \`//5-approaches\` (matched: \`5\`, \`approaches\`)  —  "Analyze problems from 5 perspectives before solving"`;

    expect(stripExistingHints(reAppended)).toBe(corruptedMessage.trim());
  });

  test('fragment + fresh re-append - both stripped correctly', () => {
    const text = `my question\r
\r
lyze problems from [5] perspectives..."\r
\r
[⚡ Workflow matched]\r
ACTION_REQUIRED_NOW: IF matches user intent → get_workflow(\`5-approaches\`), else SKIP\r
↳ \`//5-approaches\` (matched: \`5\`, \`approaches\`)  —  "Analyze problems from 5 perspectives before solving"`;

    expect(stripExistingHints(text)).toBe(`my question\r
\r
lyze problems from [5] perspectives..."`);
  });

  test('ROUND-TRIP: stripExistingHints cleans formatAutoApplyHint output completely', () => {
    const orders = new Map<string, Order>([
      ['test-order', mockOrder('test-order', 'Test description here')]
    ]);
    const keywords = new Map<string, string[]>([['test-order', ['test', 'keyword']]]);
    
    const userMessage = 'my question here';
    const hint = formatAutoApplyHint(['test-order'], orders, keywords);
    const combined = `${userMessage}\n\n${hint}`;
    
    expect(stripExistingHints(combined)).toBe(userMessage);
  });

  test('ROUND-TRIP: multiple workflows show all names in ACTION_REQUIRED', () => {
    const orders = new Map<string, Order>([
      ['security-audit', mockOrder('security-audit', 'OWASP security audit')],
      ['inspect', mockOrder('inspect', 'Inspect staged changes')]
    ]);
    const keywords = new Map<string, string[]>([
      ['security-audit', ['security']],
      ['inspect', ['check']]
    ]);
    
    const userMessage = 'check security';
    const hint = formatAutoApplyHint(['security-audit', 'inspect'], orders, keywords);
    
    expect(hint).toContain('security-audit');
    expect(hint).toContain('inspect');
    expect(stripExistingHints(`${userMessage}\n\n${hint}`)).toBe(userMessage);
  });
});

describe('stripHighlightBrackets', () => {
  test('removes single word brackets', () => {
    expect(stripHighlightBrackets('[5] approaches')).toBe('5 approaches');
  });

  test('removes adjacent word brackets', () => {
    expect(stripHighlightBrackets('[5 approaches] to solve')).toBe('5 approaches to solve');
  });

  test('removes multiple separate brackets', () => {
    expect(stripHighlightBrackets('I have [5] different [approaches]'))
      .toBe('I have 5 different approaches');
  });

  test('preserves use_workflow references', () => {
    expect(stripHighlightBrackets('[use_workflow:test-123]'))
      .toBe('[use_workflow:test-123]');
  });

  test('preserves brackets with special chars', () => {
    expect(stripHighlightBrackets('[foo:bar]')).toBe('[foo:bar]');
  });

  test('handles empty string', () => {
    expect(stripHighlightBrackets('')).toBe('');
  });

  test('handles text without brackets', () => {
    expect(stripHighlightBrackets('plain text')).toBe('plain text');
  });

  test('handles multiple words in brackets', () => {
    expect(stripHighlightBrackets('[staged changes] here'))
      .toBe('staged changes here');
  });
});

describe('sanitizeUserMessage', () => {
  test('clean message returns unchanged', () => {
    expect(sanitizeUserMessage('hello world')).toBe('hello world');
  });

  test('removes both highlights and hints', () => {
    const text = `[5 approaches] to try

[⚡ Workflow matched]
↳ [// 5-approaches]`;
    expect(sanitizeUserMessage(text)).toBe('5 approaches to try');
  });

  test('handles corrupted hint with highlights - partial ACTION_REQUIRED stripped', () => {
    const text = `[validate] my [changes]

[⚡ Workflow matched]
ACTION_REQUIRED: IF mat`;
    expect(sanitizeUserMessage(text)).toBe('validate my changes');
  });

  test('handles only highlights no hint', () => {
    expect(sanitizeUserMessage('[foo] bar [baz]')).toBe('foo bar baz');
  });

  test('handles only hint no highlights - non-fingerprint preserved', () => {
    const text = `plain text

[⚡ Orders matched]
stuff`;
    expect(sanitizeUserMessage(text)).toBe(`plain text

stuff`);
  });

  test('trims whitespace', () => {
    expect(sanitizeUserMessage('  hello  ')).toBe('hello');
  });

  test('handles multiple newlines before hint', () => {
    const text = `message



[⚡ Workflow matched]`;
    expect(sanitizeUserMessage(text)).toBe('message');
  });
});
