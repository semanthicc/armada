import type { Crew } from './types';
import type { CaptainConfig, ToolProfile } from '../core/types';

export interface AgentConfig {
  description: string;
  mode: 'agent' | 'subagent';
  prompt: string;
  model?: string;
  temperature?: number;
  tools?: Record<string, boolean>;
}

/**
 * Match a tool pattern against a list of tool IDs.
 * Supports glob-like patterns: serena_*, lsp_*, context7_*
 */
function matchToolPattern(pattern: string, toolIds: string[]): string[] {
  if (pattern.includes('*')) {
    // Convert glob to regex: serena_* -> ^serena_.*$
    const regexStr = '^' + pattern.replace(/\*/g, '.*') + '$';
    const regex = new RegExp(regexStr);
    return toolIds.filter(id => regex.test(id));
  }
  // Exact match
  return toolIds.includes(pattern) ? [pattern] : [];
}

function applyToolProfile(tools: Record<string, boolean>, profile: ToolProfile, allToolIds?: string[]): void {
  if (profile.mode === 'allowlist') {
    if (!allToolIds) {
      console.warn('[captain] Warning: allowlist mode requires allToolIds to function properly. Tools may not be filtered correctly.');
    }
    if (allToolIds && profile.allowed) {
      for (const toolId of allToolIds) {
        tools[toolId] = false;
      }
      for (const pattern of profile.allowed) {
        if (pattern.startsWith('!')) {
          const excludePattern = pattern.slice(1);
          for (const toolId of matchToolPattern(excludePattern, allToolIds)) {
            tools[toolId] = false;
          }
        } else {
          for (const toolId of matchToolPattern(pattern, allToolIds)) {
            tools[toolId] = true;
          }
        }
      }
    }
  } else {
    if (profile.disabled) {
      for (const pattern of profile.disabled) {
        if (allToolIds) {
          for (const toolId of matchToolPattern(pattern, allToolIds)) {
            tools[toolId] = false;
          }
        } else {
          tools[pattern] = false;
        }
      }
    }
    if (profile.enabled) {
      for (const pattern of profile.enabled) {
        if (allToolIds) {
          for (const toolId of matchToolPattern(pattern, allToolIds)) {
            tools[toolId] = true;
          }
        } else {
          tools[pattern] = true;
        }
      }
    }
  }
}

export function crewToAgentConfig(crew: Crew, captainConfig?: CaptainConfig, allToolIds?: string[]): AgentConfig {
  let prompt = crew.content;
  
  // Inject spawn context
  if (crew.spawnWith && crew.spawnWith.length > 0) {
    const injectedContext = crew.spawnWith
      .map(ref => {
        // Simple resolution for now - just pass the reference
        // In a real implementation, we would need to resolve the workflow/file content here
        // But since we don't have access to the workflow engine here easily without circular deps,
        // we'll just inject the reference for now and let the agent handle it or improve this later
        return `[Auto-injected context: ${ref}]`;
      })
      .join('\n\n---\n\n');
    prompt = `${injectedContext}\n\n---\n\n${prompt}`;
  }

  const config: AgentConfig = {
    description: crew.description || `(${crew.source}) ${crew.name}`,
    mode: crew.mode || 'subagent',
    prompt: prompt,
  };
  
  if (crew.model) {
    config.model = crew.model;
  }
  
  if (crew.temperature !== undefined) {
    config.temperature = crew.temperature;
  }
  
  // Build tools object
  const tools: Record<string, boolean> = {};
  
  // 1. Apply tool policy from config (global or crew-specific)
  const policyName = crew.toolPolicy ?? captainConfig?.defaultToolPolicy;
  if (crew.toolPolicy === null) {
    // Explicit null = skip all policies
    if (process.env.DEBUG_CAPTAIN) {
      console.log(`[captain] Crew "${crew.name}": toolPolicy=null, skipping all policies`);
    }
  } else if (policyName && captainConfig?.toolProfiles?.[policyName]) {
    const profile = captainConfig.toolProfiles[policyName];
    applyToolProfile(tools, profile, allToolIds);
    if (process.env.DEBUG_CAPTAIN) {
      const disabledTools = Object.entries(tools).filter(([_, v]) => !v).map(([k]) => k);
      console.log(`[captain] Crew "${crew.name}": applied policy "${policyName}", disabled: [${disabledTools.join(', ')}]`);
    }
  } else if (policyName) {
    // Policy name specified but not found
    console.warn(`[captain] Crew "${crew.name}": toolPolicy "${policyName}" not found in toolProfiles`);
  }
  
  // 2. Apply crew-specific tools (overrides policy)
  if (crew.tools && crew.tools.length > 0) {
    for (const tool of crew.tools) {
      if (tool.startsWith('!')) {
        // !toolname = disable
        tools[tool.slice(1)] = false;
      } else {
        tools[tool] = true;
      }
    }
  }
  
  // Only set tools if we have any
  if (Object.keys(tools).length > 0) {
    config.tools = tools;
  }
  
  return config;
}

export function crewsToAgentConfigs(crews: Map<string, Crew>, captainConfig?: CaptainConfig, allToolIds?: string[]): Record<string, AgentConfig> {
  const result: Record<string, AgentConfig> = {};
  const seen = new Set<string>();
  
  for (const crew of crews.values()) {
    if (seen.has(crew.name)) continue;
    seen.add(crew.name);
    result[crew.name] = crewToAgentConfig(crew, captainConfig, allToolIds);
  }
  
  return result;
}

export function filterCrewsByAgent(crews: Map<string, Crew>, activeAgent?: string): Crew[] {
  const result: Crew[] = [];
  const seen = new Set<string>();
  
  for (const crew of crews.values()) {
    if (seen.has(crew.name)) continue;
    seen.add(crew.name);
    
    if (crew.onlyFor.length === 0) {
      result.push(crew);
    } else if (activeAgent && crew.onlyFor.includes(activeAgent)) {
      result.push(crew);
    }
  }
  
  return result;
}
