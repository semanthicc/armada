import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { parseCrewFrontmatter } from '../src/crew/parser';
import { crewToAgentConfig, crewsToAgentConfigs, filterCrewsByAgent } from '../src/crew/engine';
import { loadCrews } from '../src/crew/tools';
import { registerCrewsWithConfig } from '../src/crew/hooks';
import type { Crew } from '../src/crew/types';

describe('parseCrewFrontmatter', () => {
  test('parses minimal frontmatter', () => {
    const md = `---
description: "A test crew"
---
You are a helpful assistant.`;
    const result = parseCrewFrontmatter(md);
    expect(result.description).toBe('A test crew');
    expect(result.body.trim()).toBe('You are a helpful assistant.');
    expect(result.mode).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.temperature).toBeUndefined();
    expect(result.tools).toBeUndefined();
  });

  test('parses full frontmatter with model/temperature/tools/mode', () => {
    const md = `---
description: "Full crew"
model: claude-3-opus
temperature: 0.7
tools: [read, write, bash]
mode: agent
onlyFor: [frontend-ui-ux-engineer, oracle]
---
You are a code reviewer.`;
    const result = parseCrewFrontmatter(md);
    expect(result.description).toBe('Full crew');
    expect(result.model).toBe('claude-3-opus');
    expect(result.temperature).toBe(0.7);
    expect(result.tools).toEqual(['read', 'write', 'bash']);
    expect(result.mode).toBe('agent');
    expect(result.onlyFor).toEqual(['frontend-ui-ux-engineer', 'oracle']);
  });

  test('parses tools as comma-separated string', () => {
    const md = `---
tools: read, write, bash
---
Content`;
    const result = parseCrewFrontmatter(md);
    expect(result.tools).toEqual(['read', 'write', 'bash']);
  });

  test('defaults mode to undefined (engine will default to subagent)', () => {
    const md = `---
description: "No mode"
---
Content`;
    const result = parseCrewFrontmatter(md);
    expect(result.mode).toBeUndefined();
  });

  test('handles no frontmatter', () => {
    const md = `Just content without frontmatter.`;
    const result = parseCrewFrontmatter(md);
    expect(result.description).toBe('');
    expect(result.body.trim()).toBe('Just content without frontmatter.');
  });
});

  test('parses spawnWith field', () => {
    const md = `---
spawnWith: [//workflow-a, //workflow-b]
---
Content`;
    const result = parseCrewFrontmatter(md);
    expect(result.spawnWith).toEqual(['//workflow-a', '//workflow-b']);
  });

  test('parses spawnWith as string', () => {
    const md = `---
spawnWith: //workflow-a, //workflow-b
---
Content`;
    const result = parseCrewFrontmatter(md);
    expect(result.spawnWith).toEqual(['//workflow-a', '//workflow-b']);
  });

describe('crewToAgentConfig', () => {
  test('converts minimal crew to AgentConfig', () => {
    const crew: Crew = {
      name: 'test-crew',
      path: '/path/to/crew.md',
      source: 'global',
      content: 'You are a test assistant.',
      description: 'Test crew',
      aliases: [],
      tags: [],
      onlyFor: [],
      promptType: 'crew',
      mode: 'subagent',
    };
    const config = crewToAgentConfig(crew);
    expect(config.description).toBe('Test crew');
    expect(config.mode).toBe('subagent');
    expect(config.prompt).toBe('You are a test assistant.');
    expect(config.model).toBeUndefined();
    expect(config.temperature).toBeUndefined();
    expect(config.tools).toBeUndefined();
  });

  test('converts full crew to AgentConfig', () => {
    const crew: Crew = {
      name: 'full-crew',
      path: '/path/to/crew.md',
      source: 'project',
      content: 'You are a full assistant.',
      description: 'Full crew',
      aliases: [],
      tags: [],
      onlyFor: [],
      promptType: 'crew',
      mode: 'agent',
      model: 'gpt-4',
      temperature: 0.5,
      tools: ['read', 'write'],
    };
    const config = crewToAgentConfig(crew);
    expect(config.description).toBe('Full crew');
    expect(config.mode).toBe('agent');
    expect(config.prompt).toBe('You are a full assistant.');
    expect(config.model).toBe('gpt-4');
    expect(config.temperature).toBe(0.5);
    expect(config.tools).toEqual({ read: true, write: true });
  });

  test('uses fallback description if none provided', () => {
    const crew: Crew = {
      name: 'no-desc',
      path: '/path/to/crew.md',
      source: 'global',
      content: 'Content',
      description: '',
      aliases: [],
      tags: [],
      onlyFor: [],
      promptType: 'crew',
      mode: 'subagent',
    };
    const config = crewToAgentConfig(crew);
    expect(config.description).toBe('(global) no-desc');
  });
});

  test('injects spawnWith context into prompt', () => {
    const crew: Crew = {
      name: 'context-crew',
      path: '/path/context.md',
      source: 'project',
      content: 'Original prompt',
      description: 'Context crew',
      aliases: [],
      tags: [],
      onlyFor: [],
      promptType: 'crew',
      mode: 'subagent',
      spawnWith: ['//workflow-a', '//workflow-b'],
    };
    const config = crewToAgentConfig(crew);
    expect(config.prompt).toContain('Original prompt');
    expect(config.prompt).toContain('[Auto-injected context: //workflow-a]');
    expect(config.prompt).toContain('[Auto-injected context: //workflow-b]');
  });

describe('crewsToAgentConfigs', () => {
  test('converts multiple crews to config map', () => {
    const crews = new Map<string, Crew>([
      ['crew-a', {
        name: 'crew-a',
        path: '/path/a.md',
        source: 'global',
        content: 'Content A',
        description: 'Crew A',
        aliases: [],
        tags: [],
        onlyFor: [],
        promptType: 'crew',
        mode: 'subagent',
      }],
      ['crew-b', {
        name: 'crew-b',
        path: '/path/b.md',
        source: 'project',
        content: 'Content B',
        description: 'Crew B',
        aliases: [],
        tags: [],
        onlyFor: [],
        promptType: 'crew',
        mode: 'agent',
        model: 'claude-3-opus',
      }],
    ]);
    const configs = crewsToAgentConfigs(crews);
    expect(Object.keys(configs)).toHaveLength(2);
    expect(configs['crew-a'].mode).toBe('subagent');
    expect(configs['crew-b'].mode).toBe('agent');
    expect(configs['crew-b'].model).toBe('claude-3-opus');
  });

  test('deduplicates by name', () => {
    const crews = new Map<string, Crew>([
      ['crew-a', {
        name: 'crew-a',
        path: '/path/a1.md',
        source: 'global',
        content: 'First',
        description: 'First',
        aliases: [],
        tags: [],
        onlyFor: [],
        promptType: 'crew',
        mode: 'subagent',
      }],
      ['crew-a-alias', {
        name: 'crew-a',
        path: '/path/a2.md',
        source: 'project',
        content: 'Second',
        description: 'Second',
        aliases: ['crew-a-alias'],
        tags: [],
        onlyFor: [],
        promptType: 'crew',
        mode: 'agent',
      }],
    ]);
    const configs = crewsToAgentConfigs(crews);
    expect(Object.keys(configs)).toHaveLength(1);
    expect(configs['crew-a'].description).toBe('First');
  });
});

describe('filterCrewsByAgent', () => {
  const crews = new Map<string, Crew>([
    ['all-agents', {
      name: 'all-agents',
      path: '/path/all.md',
      source: 'global',
      content: 'Available to all',
      description: 'All agents',
      aliases: [],
      tags: [],
      onlyFor: [],
      promptType: 'crew',
      mode: 'subagent',
    }],
    ['frontend-only', {
      name: 'frontend-only',
      path: '/path/frontend.md',
      source: 'global',
      content: 'Frontend only',
      description: 'Frontend',
      aliases: [],
      tags: [],
      onlyFor: ['frontend-ui-ux-engineer'],
      promptType: 'crew',
      mode: 'subagent',
    }],
    ['oracle-only', {
      name: 'oracle-only',
      path: '/path/oracle.md',
      source: 'global',
      content: 'Oracle only',
      description: 'Oracle',
      aliases: [],
      tags: [],
      onlyFor: ['oracle'],
      promptType: 'crew',
      mode: 'subagent',
    }],
  ]);

  test('returns all when no activeAgent', () => {
    const filtered = filterCrewsByAgent(crews);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('all-agents');
  });

  test('returns matching crews for specific agent', () => {
    const filtered = filterCrewsByAgent(crews, 'frontend-ui-ux-engineer');
    expect(filtered).toHaveLength(2);
    const names = filtered.map(c => c.name);
    expect(names).toContain('all-agents');
    expect(names).toContain('frontend-only');
    expect(names).not.toContain('oracle-only');
  });

  test('returns only global crews for unknown agent', () => {
    const filtered = filterCrewsByAgent(crews, 'unknown-agent');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('all-agents');
  });
});

describe('registerCrewsWithConfig', () => {
  test('merges crews into existing config.agent', () => {
    const crews = new Map<string, Crew>([
      ['test-crew', {
        name: 'test-crew',
        path: '/path/test.md',
        source: 'global',
        content: 'Test content',
        description: 'Test crew',
        aliases: [],
        tags: [],
        onlyFor: [],
        promptType: 'crew',
        mode: 'subagent',
      }],
    ]);
    const existingAgent = { 'existing-agent': { description: 'Existing' } };
    const result = registerCrewsWithConfig(crews, existingAgent);
    
    expect(result['existing-agent']).toBeDefined();
    expect(result['test-crew']).toBeDefined();
    expect((result['test-crew'] as any).description).toBe('Test crew');
  });

  test('works with undefined config.agent', () => {
    const crews = new Map<string, Crew>([
      ['new-crew', {
        name: 'new-crew',
        path: '/path/new.md',
        source: 'global',
        content: 'New content',
        description: 'New crew',
        aliases: [],
        tags: [],
        onlyFor: [],
        promptType: 'crew',
        mode: 'agent',
      }],
    ]);
    const result = registerCrewsWithConfig(crews, undefined);
    
    expect(result['new-crew']).toBeDefined();
    expect((result['new-crew'] as any).mode).toBe('agent');
  });
});

describe('loadCrews integration', () => {
  const testProjectDir = join(tmpdir(), 'test-crews-' + Date.now());
  const crewDir = join(testProjectDir, '.opencode', 'crew');

  beforeAll(() => {
    mkdirSync(crewDir, { recursive: true });
    
    writeFileSync(join(crewDir, 'code-reviewer.md'), `---
description: "Reviews code for quality"
model: claude-3-opus
temperature: 0.3
tools: [read, glob, grep]
mode: subagent
---
You are a code reviewer. Analyze code for:
- Code quality
- Best practices
- Potential bugs`);
    
    writeFileSync(join(crewDir, 'frontend-expert.md'), `---
description: "Frontend development expert"
mode: agent
onlyFor: [frontend-ui-ux-engineer]
---
You are a frontend development expert.`);
  });

  afterAll(() => {
    if (existsSync(testProjectDir)) {
      rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  test('loads crews from project directory', () => {
    const crews = loadCrews(testProjectDir);
    expect(crews.size).toBeGreaterThanOrEqual(2);
    
    const reviewer = crews.get('code-reviewer');
    expect(reviewer).toBeDefined();
    expect(reviewer?.model).toBe('claude-3-opus');
    expect(reviewer?.temperature).toBe(0.3);
    expect(reviewer?.tools).toEqual(['read', 'glob', 'grep']);
    expect(reviewer?.mode).toBe('subagent');
    
    const frontend = crews.get('frontend-expert');
    expect(frontend).toBeDefined();
    expect(frontend?.mode).toBe('agent');
    expect(frontend?.onlyFor).toContain('frontend-ui-ux-engineer');
  });

  test('crew content excludes frontmatter', () => {
    const crews = loadCrews(testProjectDir);
    const reviewer = crews.get('code-reviewer');
    expect(reviewer?.content).not.toContain('---');
    expect(reviewer?.content).toContain('code reviewer');
  });
});

describe('crews mode defaults', () => {
  test('crew without mode defaults to subagent in engine', () => {
    const crew: Crew = {
      name: 'no-mode',
      path: '/path/no-mode.md',
      source: 'global',
      content: 'Content',
      description: 'No mode specified',
      aliases: [],
      tags: [],
      onlyFor: [],
      promptType: 'crew',
      mode: 'subagent',
    };
    const config = crewToAgentConfig(crew);
    expect(config.mode).toBe('subagent');
  });

  test('crew with mode=agent uses agent mode', () => {
    const crew: Crew = {
      name: 'agent-mode',
      path: '/path/agent.md',
      source: 'global',
      content: 'Content',
      description: 'Agent mode',
      aliases: [],
      tags: [],
      onlyFor: [],
      promptType: 'crew',
      mode: 'agent',
    };
    const config = crewToAgentConfig(crew);
    expect(config.mode).toBe('agent');
  });
});


describe('tool policy system', () => {
  const baseCrew: Crew = {
    name: 'test-crew',
    path: '/path/test.md',
    source: 'global',
    content: 'Test content',
    description: 'Test crew',
    aliases: [],
    tags: [],
    onlyFor: [],
    promptType: 'crew',
    mode: 'subagent',
  };

  describe('crewToAgentConfig with tool policies', () => {
    test('applies tool profile from captainConfig', () => {
      const crew: Crew = { ...baseCrew };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          restricted: { disabled: ['bash', 'write', 'edit'] },
        },
        defaultToolPolicy: 'restricted',
      };
      
      const config = crewToAgentConfig(crew, captainConfig);
      expect(config.tools).toEqual({ bash: false, write: false, edit: false });
    });

    test('crew toolPolicy overrides defaultToolPolicy', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'full' };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          restricted: { disabled: ['bash', 'write', 'edit'] },
          full: { disabled: [] },
        },
        defaultToolPolicy: 'restricted',
      };
      
      const config = crewToAgentConfig(crew, captainConfig);
      expect(config.tools).toBeUndefined(); // full profile has no disabled tools
    });

    test('crew tools override policy', () => {
      const crew: Crew = { ...baseCrew, tools: ['read', 'glob', 'write'] };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          restricted: { disabled: ['bash', 'write', 'edit'] },
        },
        defaultToolPolicy: 'restricted',
      };
      
      const config = crewToAgentConfig(crew, captainConfig);
      // Policy disables write, but crew tools re-enable it
      expect(config.tools?.bash).toBe(false);
      expect(config.tools?.edit).toBe(false);
      expect(config.tools?.write).toBe(true);
      expect(config.tools?.read).toBe(true);
      expect(config.tools?.glob).toBe(true);
    });

    test('supports !toolname syntax to disable tools', () => {
      const crew: Crew = { ...baseCrew, tools: ['read', '!bash', '!write'] };
      
      const config = crewToAgentConfig(crew);
      expect(config.tools?.read).toBe(true);
      expect(config.tools?.bash).toBe(false);
      expect(config.tools?.write).toBe(false);
    });

    test('profile enabled overrides disabled', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'mixed' };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          mixed: { 
            disabled: ['bash', 'write', 'edit'],
            enabled: ['write'],  // Re-enable write
          },
        },
      };
      
      const config = crewToAgentConfig(crew, captainConfig);
      expect(config.tools?.bash).toBe(false);
      expect(config.tools?.edit).toBe(false);
      expect(config.tools?.write).toBe(true);
    });

    test('no tools when no policy and no crew tools', () => {
      const crew: Crew = { ...baseCrew };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
      };
      
      const config = crewToAgentConfig(crew, captainConfig);
      expect(config.tools).toBeUndefined();
    });

    test('ignores non-existent policy', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'nonexistent' };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          restricted: { disabled: ['bash'] },
        },
      };
      
      const config = crewToAgentConfig(crew, captainConfig);
      expect(config.tools).toBeUndefined();
    });
  });

  describe('parseCrewFrontmatter with toolPolicy', () => {
    test('parses toolPolicy field', () => {
      const md = `---
description: "Test crew"
toolPolicy: restricted
---
Content`;
      const result = parseCrewFrontmatter(md);
      expect(result.toolPolicy).toBe('restricted');
    });

    test('toolPolicy is undefined when not specified', () => {
      const md = `---
description: "Test crew"
---
Content`;
      const result = parseCrewFrontmatter(md);
      expect(result.toolPolicy).toBeUndefined();
    });
  });

  describe('registerCrewsWithConfig with captainConfig', () => {
    test('passes captainConfig to crewsToAgentConfigs', () => {
      const crews = new Map<string, Crew>([
        ['test-crew', { ...baseCrew }],
      ]);
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          restricted: { disabled: ['bash', 'write'] },
        },
        defaultToolPolicy: 'restricted',
      };
      
      const result = registerCrewsWithConfig(crews, undefined, captainConfig);
      const crewConfig = result['test-crew'] as any;
      expect(crewConfig.tools).toEqual({ bash: false, write: false });
    });
  });

  describe('allowlist mode', () => {
    const allTools = ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'webfetch', 
                      'serena_find_symbol', 'serena_get_symbols_overview', 'serena_search_for_pattern',
                      'lsp_hover', 'lsp_find_references', 'lsp_document_symbols',
                      'context7_resolve-library-id', 'context7_query-docs'];

    test('allowlist mode denies all except allowed', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'minimal' };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          minimal: { 
            mode: 'allowlist' as const,
            allowed: ['read', 'glob', 'grep'] 
          },
        },
      };
      
      const config = crewToAgentConfig(crew, captainConfig, allTools);
      expect(config.tools?.read).toBe(true);
      expect(config.tools?.glob).toBe(true);
      expect(config.tools?.grep).toBe(true);
      expect(config.tools?.write).toBe(false);
      expect(config.tools?.edit).toBe(false);
      expect(config.tools?.bash).toBe(false);
    });

    test('allowlist supports glob patterns', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'serena_only' };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          serena_only: { 
            mode: 'allowlist' as const,
            allowed: ['read', 'serena_*'] 
          },
        },
      };
      
      const config = crewToAgentConfig(crew, captainConfig, allTools);
      expect(config.tools?.read).toBe(true);
      expect(config.tools?.serena_find_symbol).toBe(true);
      expect(config.tools?.serena_get_symbols_overview).toBe(true);
      expect(config.tools?.serena_search_for_pattern).toBe(true);
      expect(config.tools?.lsp_hover).toBe(false);
      expect(config.tools?.write).toBe(false);
    });

    test('allowlist with !pattern excludes from allowed', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'lsp_no_rename' };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          lsp_no_rename: { 
            mode: 'allowlist' as const,
            allowed: ['read', 'lsp_*', '!lsp_find_references'] 
          },
        },
      };
      
      const config = crewToAgentConfig(crew, captainConfig, allTools);
      expect(config.tools?.read).toBe(true);
      expect(config.tools?.lsp_hover).toBe(true);
      expect(config.tools?.lsp_document_symbols).toBe(true);
      expect(config.tools?.lsp_find_references).toBe(false);
    });

    test('crew tools can add to allowlist', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'minimal', tools: ['webfetch', 'context7_*'] };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          minimal: { 
            mode: 'allowlist' as const,
            allowed: ['read', 'glob'] 
          },
        },
      };
      
      const config = crewToAgentConfig(crew, captainConfig, allTools);
      expect(config.tools?.read).toBe(true);
      expect(config.tools?.glob).toBe(true);
      expect(config.tools?.webfetch).toBe(true);
      expect(config.tools?.['context7_*']).toBe(true);
    });

    test('blocklist mode with glob patterns', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'no_lsp' };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          no_lsp: { 
            mode: 'blocklist' as const,
            disabled: ['lsp_*'] 
          },
        },
      };
      
      const config = crewToAgentConfig(crew, captainConfig, allTools);
      expect(config.tools?.lsp_hover).toBe(false);
      expect(config.tools?.lsp_find_references).toBe(false);
      expect(config.tools?.lsp_document_symbols).toBe(false);
      expect(config.tools?.read).toBeUndefined();
    });

    test('new tools are auto-denied in allowlist mode', () => {
      const crew: Crew = { ...baseCrew, toolPolicy: 'minimal' };
      const captainConfig = {
        deduplicateSameMessage: true,
        maxNestingDepth: 3,
        expandOrders: true,
        toolProfiles: {
          minimal: { 
            mode: 'allowlist' as const,
            allowed: ['read', 'glob'] 
          },
        },
      };
      
      const allToolsWithNew = [...allTools, 'new_plugin_tool', 'another_new_tool'];
      
      const config = crewToAgentConfig(crew, captainConfig, allToolsWithNew);
      expect(config.tools?.new_plugin_tool).toBe(false);
      expect(config.tools?.another_new_tool).toBe(false);
      expect(config.tools?.read).toBe(true);
    });
  });
});
