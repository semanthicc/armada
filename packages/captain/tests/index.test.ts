import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { 
  loadConfig, 
  expandWorkflowMentions, 
  WorkflowConfig, 
  WorkflowInfo, 
  clearSessionWorkflows, 
  getSessionWorkflows,
  setSessionWorkflowRef,
  processWorkflowMentionsForSession,
  ProcessMentionsResult
} from '../src/testing';

function mockWorkflow(overrides: Partial<WorkflowInfo> & { name: string; content: string }): WorkflowInfo {
  return {
    aliases: [],
    tags: [],
    onlyFor: [],
      spawnAt: [],
    description: '',
    automention: 'false',
    workflowInWorkflow: 'false',
    source: 'global',
    path: `/mock/${overrides.name}.md`,
    ...overrides
  };
}

function mockConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    deduplicateSameMessage: true,
    maxNestingDepth: 3,
    ...overrides
  };
}

const CONFIG_PATH = join(homedir(), '.config', 'opencode', 'workflows.json');
const CONFIG_BACKUP_PATH = join(homedir(), '.config', 'opencode', 'workflows.json.bak');

describe('loadConfig', () => {
  let originalConfigExists = false;
  
  beforeEach(() => {
    if (existsSync(CONFIG_PATH)) {
      originalConfigExists = true;
      const { readFileSync } = require('fs');
      writeFileSync(CONFIG_BACKUP_PATH, readFileSync(CONFIG_PATH));
    }
  });

  afterEach(() => {
    if (originalConfigExists && existsSync(CONFIG_BACKUP_PATH)) {
      const { readFileSync } = require('fs');
      writeFileSync(CONFIG_PATH, readFileSync(CONFIG_BACKUP_PATH));
      unlinkSync(CONFIG_BACKUP_PATH);
    } else if (existsSync(CONFIG_PATH) && !originalConfigExists) {
      unlinkSync(CONFIG_PATH);
    }
  });

  test('returns default config when file does not exist', () => {
    if (existsSync(CONFIG_PATH)) {
      unlinkSync(CONFIG_PATH);
    }
    const config = loadConfig();
    expect(config.deduplicateSameMessage).toBe(true);
  });

  test('creates config file with defaults when missing', () => {
    if (existsSync(CONFIG_PATH)) {
      unlinkSync(CONFIG_PATH);
    }
    loadConfig();
    expect(existsSync(CONFIG_PATH)).toBe(true);
  });

  test('reads deduplicateSameMessage: true from file', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ deduplicateSameMessage: true }), 'utf-8');
    const config = loadConfig();
    expect(config.deduplicateSameMessage).toBe(true);
  });

  test('reads deduplicateSameMessage: false from file', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ deduplicateSameMessage: false }), 'utf-8');
    const config = loadConfig();
    expect(config.deduplicateSameMessage).toBe(false);
  });

  test('defaults to true when field is missing in config', () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({}), 'utf-8');
    const config = loadConfig();
    expect(config.deduplicateSameMessage).toBe(true);
  });

  test('defaults to true on malformed JSON', () => {
    writeFileSync(CONFIG_PATH, 'not valid json {{{', 'utf-8');
    const config = loadConfig();
    expect(config.deduplicateSameMessage).toBe(true);
  });
});

describe('expandWorkflowMentions', () => {
  const mockWorkflows = new Map<string, WorkflowInfo>();
  
  beforeEach(() => {
    mockWorkflows.clear();
    mockWorkflows.set('test-workflow', {
      name: 'test-workflow',
      aliases: ['tw'],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'A test workflow',
      automention: 'false',
      workflowInWorkflow: 'false',
      content: '# Test Workflow Content',
      source: 'global',
      path: '/mock/path/test-workflow.md'
    });
    mockWorkflows.set('tw', mockWorkflows.get('test-workflow')!);
    
    mockWorkflows.set('other-workflow', {
      name: 'other-workflow',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Another workflow',
      automention: 'false',
      workflowInWorkflow: 'false',
      content: '# Other Content',
      source: 'global',
      path: '/mock/path/other-workflow.md'
    });
  });

  describe('with deduplicateSameMessage: true', () => {
    const config = mockConfig();

    test('expands single mention', () => {
      const result = expandWorkflowMentions('Use //test-workflow here', mockWorkflows, config);
      expect(result.found).toEqual(['test-workflow']);
      expect(result.expanded).toContain('<workflow name="test-workflow"');
      expect(result.expanded).toContain('# Test Workflow Content');
    });

    test('first occurrence expands, second becomes reference', () => {
      const result = expandWorkflowMentions('//test-workflow first then //test-workflow again', mockWorkflows, config);
      expect(result.found).toEqual(['test-workflow']);
      expect(result.expanded).toContain('<workflow name="test-workflow"');
      expect(result.expanded).toContain('[use_workflow:test-workflow]');
      
      const workflowTagCount = (result.expanded.match(/<workflow/g) || []).length;
      expect(workflowTagCount).toBe(1);
    });

    test('different workflows both expand', () => {
      const result = expandWorkflowMentions('//test-workflow and //other-workflow', mockWorkflows, config);
      expect(result.found).toContain('test-workflow');
      expect(result.found).toContain('other-workflow');
      expect(result.expanded).toContain('<workflow name="test-workflow"');
      expect(result.expanded).toContain('<workflow name="other-workflow"');
    });

    test('three occurrences: first expands, rest reference', () => {
      const result = expandWorkflowMentions('//test-workflow //test-workflow //test-workflow', mockWorkflows, config);
      expect(result.found).toEqual(['test-workflow']);
      
      const workflowTagCount = (result.expanded.match(/<workflow/g) || []).length;
      expect(workflowTagCount).toBe(1);
      
      const refCount = (result.expanded.match(/\[use_workflow:test-workflow\]/g) || []).length;
      expect(refCount).toBe(2);
    });
  });

  describe('with deduplicateSameMessage: false', () => {
    const config = mockConfig({ deduplicateSameMessage: false });

    test('all occurrences expand fully', () => {
      const result = expandWorkflowMentions('//test-workflow first then //test-workflow again', mockWorkflows, config);
      expect(result.found).toEqual(['test-workflow']);
      
      const workflowTagCount = (result.expanded.match(/<workflow/g) || []).length;
      expect(workflowTagCount).toBe(2);
      
      expect(result.expanded).not.toContain('[use_workflow:');
    });

    test('three occurrences all expand', () => {
      const result = expandWorkflowMentions('//test-workflow //test-workflow //test-workflow', mockWorkflows, config);
      
      const workflowTagCount = (result.expanded.match(/<workflow/g) || []).length;
      expect(workflowTagCount).toBe(3);
    });
  });

  describe('edge cases', () => {
    const config = mockConfig();

    test('unknown workflow returns in notFound', () => {
      const result = expandWorkflowMentions('//unknown-workflow', mockWorkflows, config);
      expect(result.notFound).toContain('unknown-workflow');
      expect(result.found).toEqual([]);
    });

    test('no mentions returns empty arrays', () => {
      const result = expandWorkflowMentions('just plain text', mockWorkflows, config);
      expect(result.found).toEqual([]);
      expect(result.notFound).toEqual([]);
      expect(result.expanded).toBe('just plain text');
    });

    test('mixed known and unknown workflows', () => {
      const result = expandWorkflowMentions('//test-workflow and //fake-one', mockWorkflows, config);
      expect(result.found).toContain('test-workflow');
      expect(result.notFound).toContain('fake-one');
    });
  });
});

describe('cross-message workflow deduplication', () => {
  const TEST_SESSION_ID = 'test-session-cross-message';
  const mockWorkflows = new Map<string, WorkflowInfo>();

  beforeEach(() => {
    clearSessionWorkflows(TEST_SESSION_ID);
    mockWorkflows.clear();
    mockWorkflows.set('patchlog', {
      name: 'patchlog',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Generate patchlog',
      automention: 'false',
      workflowInWorkflow: 'false',
      content: '# Patchlog Workflow Content',
      source: 'global',
      path: '/mock/path/patchlog.md'
    });
  });

  afterEach(() => {
    clearSessionWorkflows(TEST_SESSION_ID);
  });

  test('session starts empty', () => {
    const refs = getSessionWorkflows(TEST_SESSION_ID);
    expect(refs).toBeUndefined();
  });

  test('first message expands workflow and stores ref in session', () => {
    const sessionID = TEST_SESSION_ID;
    const config = mockConfig();

    const result = processWorkflowMentionsForSession(
      'Use //patchlog here',
      sessionID,
      'msg-0001',
      mockWorkflows,
      config
    );

    expect(result.found).toContain('patchlog');
    expect(result.expanded).toContain('<workflow name="patchlog"');
    
    const refs = getSessionWorkflows(sessionID);
    expect(refs).toBeDefined();
    expect(refs!.has('patchlog')).toBe(true);
    expect(refs!.get('patchlog')!.messageID).toBe('msg-0001');
  });

  test('BUG: second message should use reference, not full expansion', () => {
    const sessionID = TEST_SESSION_ID;
    const config = mockConfig();

    const result1 = processWorkflowMentionsForSession(
      'Use //patchlog here',
      sessionID,
      'msg-0001',
      mockWorkflows,
      config
    );
    expect(result1.found).toContain('patchlog');

    const result2 = processWorkflowMentionsForSession(
      'Again //patchlog please',
      sessionID,
      'msg-0002',
      mockWorkflows,
      config
    );

    expect(result2.reused).toContain('patchlog');
    expect(result2.found).not.toContain('patchlog');
    
    expect(result2.expanded).toContain('[use_workflow:patchlog-');
    expect(result2.expanded).not.toContain('<workflow name="patchlog"');
    
    const workflowTagCount = (result2.expanded.match(/<workflow/g) || []).length;
    expect(workflowTagCount).toBe(0);
  });

  test('PHASE 3 BUG: different workflows should have different IDs in session refs', () => {
    const sessionID = TEST_SESSION_ID;
    const config = mockConfig();

    mockWorkflows.set('5-approaches', {
      name: '5-approaches',
      aliases: ['5a'],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Analyze from 5 perspectives',
      automention: 'false',
      workflowInWorkflow: 'false',
      content: '# 5 Approaches Content',
      source: 'global',
      path: '/mock/path/5-approaches.md'
    });

    const result1 = processWorkflowMentionsForSession(
      'Use //patchlog here',
      sessionID,
      'msg-0001',
      mockWorkflows,
      config
    );
    expect(result1.found).toContain('patchlog');

    const result2 = processWorkflowMentionsForSession(
      'Now use //5-approaches',
      sessionID,
      'msg-0002',
      mockWorkflows,
      config
    );
    expect(result2.found).toContain('5-approaches');

    const refs = getSessionWorkflows(sessionID);
    expect(refs).toBeDefined();
    
    const patchlogRef = refs!.get('patchlog');
    const approachesRef = refs!.get('5-approaches');
    
    expect(patchlogRef).toBeDefined();
    expect(approachesRef).toBeDefined();
    expect(patchlogRef!.id).not.toBe(approachesRef!.id);
  });

  test('PHASE 3 BUG: reused workflow should keep original ID, not inherit from other workflow', () => {
    const sessionID = TEST_SESSION_ID;
    const config = mockConfig();

    mockWorkflows.set('5-approaches', {
      name: '5-approaches',
      aliases: ['5a'],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Analyze from 5 perspectives',
      automention: 'false',
      workflowInWorkflow: 'false',
      content: '# 5 Approaches Content',
      source: 'global',
      path: '/mock/path/5-approaches.md'
    });

    const result1 = processWorkflowMentionsForSession(
      'Use //patchlog here',
      sessionID,
      'msg-0001',
      mockWorkflows,
      config
    );

    const refs1 = getSessionWorkflows(sessionID);
    const originalPatchlogId = refs1!.get('patchlog')!.id;

    const result2 = processWorkflowMentionsForSession(
      'Now //5-approaches and //patchlog again',
      sessionID,
      'msg-0002',
      mockWorkflows,
      config
    );

    expect(result2.found).toContain('5-approaches');
    expect(result2.reused).toContain('patchlog');

    const refs2 = getSessionWorkflows(sessionID);
    const patchlogRef = refs2!.get('patchlog');
    const approachesRef = refs2!.get('5-approaches');

    expect(patchlogRef!.id).toBe(originalPatchlogId);
    expect(result2.expanded).toContain(`[use_workflow:patchlog-${originalPatchlogId}]`);
    expect(approachesRef!.id).not.toBe(patchlogRef!.id);
  });

  test('PHASE 3 CRITICAL: ID collision should NOT cause new workflow to be treated as reference', () => {
    const sessionID = TEST_SESSION_ID;
    const config = mockConfig();

    mockWorkflows.set('5-approaches', {
      name: '5-approaches',
      aliases: ['5a'],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Analyze from 5 perspectives',
      automention: 'false',
      workflowInWorkflow: 'false',
      content: '# 5 Approaches Content',
      source: 'global',
      path: '/mock/path/5-approaches.md'
    });

    const result1 = processWorkflowMentionsForSession(
      '//patchlog',
      sessionID,
      'msg-1111COrY', 
      mockWorkflows,
      config
    );
    
    expect(result1.found).toContain('patchlog');
    expect(result1.expanded).toContain('<workflow name="patchlog"');
    
    const refs1 = getSessionWorkflows(sessionID);
    expect(refs1!.get('patchlog')!.id).toBeDefined();

    const result2 = processWorkflowMentionsForSession(
      '//5-approaches',
      sessionID,
      'msg-2222COrY', 
      mockWorkflows,
      config
    );
    
    expect(result2.found).toContain('5-approaches');
    expect(result2.expanded).toContain('<workflow name="5-approaches"');
    
    expect(result2.expanded).not.toContain('[use_workflow:5-approaches');
    
    const refs2 = getSessionWorkflows(sessionID);
    expect(refs2!.get('patchlog')!.id).toBeDefined();
    expect(refs2!.get('5-approaches')!.id).toBeDefined();
    expect(refs2!.get('patchlog')!.id).not.toBe(refs2!.get('5-approaches')!.id);
  });

  test('BUG FIX: Regex collision should not expand mentions inside already expanded content', () => {
    const config = mockConfig();
    
    mockWorkflows.set('container-wf', {
      name: 'container-wf',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Contains a reference',
      automention: 'false',
      workflowInWorkflow: 'false',
      content: 'Check out //nested-wf for more info.',
      source: 'global',
      path: '/path/container.md'
    });

    mockWorkflows.set('nested-wf', {
      name: 'nested-wf',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Nested one',
      automention: 'false',
      workflowInWorkflow: 'false',
      content: 'I am the nested workflow.',
      source: 'global',
      path: '/path/nested.md'
    });

    const text = '//container-wf and //nested-wf';
    const result = expandWorkflowMentions(text, mockWorkflows, config);

    expect(result.found).toContain('container-wf');
    expect(result.found).toContain('nested-wf');

    expect(result.expanded).toContain('<workflow name="container-wf"');
    
    expect(result.expanded).toContain('Check out //nested-wf for more info');
    expect(result.expanded).not.toContain('Check out <workflow name="nested-wf"');
    expect(result.expanded).not.toContain('Check out [use_workflow:nested-wf');

    expect(result.expanded).toContain('<workflow name="nested-wf"');
  });

  test('Explicit call should expand even if previously implicitly expanded', () => {
    const sessionID = 'test-implicit-overrule';
    const config = mockConfig();

    mockWorkflows.set('wf-a', {
      name: 'wf-a',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: '',
      automention: 'false',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '',
      content: 'Includes [use_workflow:wf-b-1234]'
    });
    mockWorkflows.set('wf-b', {
      name: 'wf-b',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: '',
      automention: 'false',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '',
      content: 'I am B content'
    });

    const result1 = processWorkflowMentionsForSession('//wf-a', sessionID, 'msg1', mockWorkflows, config);
    
    expect(result1.found).toContain('wf-a');
    expect(result1.found).toContain('wf-b');
    
    const refs = getSessionWorkflows(sessionID)!;
    expect(refs.get('wf-b')!.implicit).toBe(true);

    const result2 = processWorkflowMentionsForSession('//wf-b', sessionID, 'msg2', mockWorkflows, config);
    
    expect(result2.found).toContain('wf-b');
    expect(result2.expanded).toContain('<workflow name="wf-b"');
    expect(result2.expanded).not.toContain('[use_workflow:wf-b');
  });
});

describe('DEBUG: Trace workflow expansion', () => {
  const mockWorkflows = new Map<string, WorkflowInfo>();

  beforeEach(() => {
    clearSessionWorkflows();
    mockWorkflows.clear();
  });

  test('DEBUG: Trace patchlog-like scenario with nested workflow mention in content', () => {
    const sessionID = 'debug-session';
    const config = mockConfig();

    mockWorkflows.set('patchlog', {
      name: 'patchlog',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Generate patchlog',
      automention: 'false',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '/mock/patchlog.md',
      content: `# Patchlog
Example: suggests //5-approaches for analysis
End of patchlog.`
    });

    mockWorkflows.set('5-approaches', {
      name: '5-approaches',
      aliases: ['5a'],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Analyze from 5 perspectives',
      automention: 'false',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '/mock/5-approaches.md',
      content: '# 5 Approaches Content'
    });

    const messageID = 'message_abc123xyz';
    const userText = 'just checking out //patchlog';

    console.log('\n=== DEBUG TRACE ===');
    console.log('Input text:', userText);
    console.log('MessageID:', messageID);

    const result = processWorkflowMentionsForSession(
      userText,
      sessionID,
      messageID,
      mockWorkflows,
      config
    );

    console.log('\n--- Results ---');
    console.log('Found:', result.found);
    console.log('Reused:', result.reused);
    console.log('NotFound:', result.notFound);
    console.log('\n--- Expanded text ---');
    console.log(result.expanded);
    console.log('\n--- Session state ---');
    const refs = getSessionWorkflows(sessionID);
    if (refs) {
      for (const [name, ref] of refs.entries()) {
        console.log(`  ${name}: id=${ref.id}, messageID=${ref.messageID}, implicit=${ref.implicit}`);
      }
    }
    console.log('=== END DEBUG ===\n');

    expect(result.found).toContain('patchlog');
    expect(result.found).not.toContain('5-approaches');
    
    expect(result.expanded).toContain('<workflow name="patchlog"');
    expect(result.expanded).toContain('suggests //5-approaches for analysis');
    expect(result.expanded).not.toContain('<workflow name="5-approaches"');

    const patchlogRef = refs?.get('patchlog');
    expect(patchlogRef).toBeDefined();
    console.log('Patchlog ID:', patchlogRef?.id);
    expect(patchlogRef?.id.length).toBeGreaterThan(2);
  });

  test('DEBUG: Trace multiple mentions in same message', () => {
    const sessionID = 'debug-session-2';
    const config = mockConfig();

    mockWorkflows.set('wf-a', {
      name: 'wf-a',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Workflow A',
      automention: 'false',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '/mock/wf-a.md',
      content: '# Content A'
    });

    mockWorkflows.set('wf-b', {
      name: 'wf-b',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Workflow B',
      automention: 'false',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '/mock/wf-b.md',
      content: '# Content B'
    });

    const messageID = 'message_def456uvw';
    const userText = '//wf-a and then //wf-b and //wf-a again';

    console.log('\n=== DEBUG TRACE 2 ===');
    console.log('Input text:', userText);
    console.log('MessageID:', messageID);

    const result = processWorkflowMentionsForSession(
      userText,
      sessionID,
      messageID,
      mockWorkflows,
      config
    );

    console.log('\n--- Results ---');
    console.log('Found:', result.found);
    console.log('Reused:', result.reused);
    console.log('\n--- Expanded text ---');
    console.log(result.expanded);
    console.log('\n--- Session state ---');
    const refs = getSessionWorkflows(sessionID);
    if (refs) {
      for (const [name, ref] of refs.entries()) {
        console.log(`  ${name}: id=${ref.id}, messageID=${ref.messageID}, implicit=${ref.implicit}`);
      }
    }
    console.log('=== END DEBUG 2 ===\n');

    expect(result.found).toContain('wf-a');
    expect(result.found).toContain('wf-b');
    
    expect(result.expanded).toContain('<workflow name="wf-a"');
    expect(result.expanded).toContain('<workflow name="wf-b"');
    
    const countWfAExpansions = (result.expanded.match(/<workflow name="wf-a"/g) || []).length;
    expect(countWfAExpansions).toBe(1);
    
    expect(result.expanded).toContain('[use_workflow:wf-a-');
  });

  test('DEBUG: Trace cross-message behavior', () => {
    const sessionID = 'debug-session-3';
    const config = mockConfig();

    mockWorkflows.set('workflow-x', {
      name: 'workflow-x',
      aliases: [],
      tags: [],
      onlyFor: [],
      spawnAt: [],
      description: 'Workflow X',
      automention: 'false',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '/mock/workflow-x.md',
      content: '# Content X'
    });

    console.log('\n=== DEBUG TRACE 3: Cross-message ===');
    
    const result1 = processWorkflowMentionsForSession(
      '//workflow-x',
      sessionID,
      'message_111aaa',
      mockWorkflows,
      config
    );

    console.log('Message 1 - Found:', result1.found);
    console.log('Message 1 - Expanded contains workflow tag:', result1.expanded.includes('<workflow name="workflow-x"'));

    const result2 = processWorkflowMentionsForSession(
      '//workflow-x again',
      sessionID,
      'message_222bbb',
      mockWorkflows,
      config
    );

    console.log('Message 2 - Found:', result2.found);
    console.log('Message 2 - Reused:', result2.reused);
    console.log('Message 2 - Expanded:', result2.expanded);

    const refs = getSessionWorkflows(sessionID);
    console.log('Session refs:', refs);
    console.log('=== END DEBUG 3 ===\n');

    expect(result1.found).toContain('workflow-x');
    expect(result2.reused).toContain('workflow-x');
    expect(result2.expanded).toContain('[use_workflow:workflow-x-');
    expect(result2.expanded).not.toContain('<workflow name="workflow-x"');
  });
});

describe('Multi-part message behavior (split-message bug fix)', () => {
  let mockWorkflows: Map<string, WorkflowInfo>;
  
  beforeEach(() => {
    clearSessionWorkflows();
    mockWorkflows = new Map();
  });

  test('Does NOT auto-apply in Part 1 if Part 2 contains a workflow mention', () => {
    const sessionID = 'split-test-session';
    const messageID = 'msg-split-test';
    const config = mockConfig();

    mockWorkflows.set('5-approaches', {
      name: '5-approaches',
      aliases: ['5a'],
      tags: ['solve', 'problem', 'analyze'],
      onlyFor: [],
      spawnAt: [],
      description: 'Analyze from 5 perspectives',
      automention: 'true',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '/mock/5-approaches.md',
      content: '# 5 Approaches\nAnalyze the problem...'
    });

    const { processMultiPartMessage, TextPart } = require('../src/testing');
    const parts = [
      { type: 'text', text: 'I need to solve a problem.' },
      { type: 'text', text: ' I will use //5-approaches for this.' }
    ];

    const result = processMultiPartMessage(
      parts,
      sessionID,
      messageID,
      mockWorkflows,
      config
    );

    expect(result.hasGlobalMentions).toBe(true);
    expect(result.parts[0].text).toBe('I need to solve a problem.');
    expect(result.parts[0].text).not.toContain('[Auto-apply workflow');
    expect(result.parts[1].text).toContain('<workflow name="5-approaches"');
  });

  test('DOES auto-apply when NO part contains workflow mentions', () => {
    const sessionID = 'auto-apply-session';
    const messageID = 'msg-auto-apply';
    const config = mockConfig();

    mockWorkflows.set('5-approaches', {
      name: '5-approaches',
      aliases: ['5a'],
      tags: ['solve', 'problem'],
      onlyFor: [],
      spawnAt: [],
      description: 'Analyze from 5 perspectives',
      automention: 'true',
      workflowInWorkflow: 'false',
      source: 'global',
      path: '/mock/5-approaches.md',
      content: '# 5 Approaches'
    });

    const parts = [
      { type: 'text', text: 'I need to solve a problem.' },
      { type: 'text', text: ' Can you help me analyze this?' }
    ];

    const { processMultiPartMessage } = require('../src/testing');
    const result = processMultiPartMessage(
      parts,
      sessionID,
      messageID,
      mockWorkflows,
      config
    );

    expect(result.hasGlobalMentions).toBe(false);
    expect(result.parts[0].text).toContain('[Auto-apply workflow');
    expect(result.parts[0].text).toContain('//5-approaches');
  });
});
