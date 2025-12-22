import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { loadConfig, expandWorkflowMentions, WorkflowConfig, WorkflowInfo } from '../src/index';

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
      agents: [],
      description: 'A test workflow',
      autoworkflow: false,
      content: '# Test Workflow Content',
      source: 'global',
      path: '/mock/path/test-workflow.md'
    });
    mockWorkflows.set('tw', mockWorkflows.get('test-workflow')!);
    
    mockWorkflows.set('other-workflow', {
      name: 'other-workflow',
      aliases: [],
      tags: [],
      agents: [],
      description: 'Another workflow',
      autoworkflow: false,
      content: '# Other Content',
      source: 'global',
      path: '/mock/path/other-workflow.md'
    });
  });

  describe('with deduplicateSameMessage: true', () => {
    const config: WorkflowConfig = { deduplicateSameMessage: true };

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
    const config: WorkflowConfig = { deduplicateSameMessage: false };

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
    const config: WorkflowConfig = { deduplicateSameMessage: true };

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
