import type { Crew } from './types';
import type { CaptainConfig } from '../core/types';
import { crewsToAgentConfigs, type AgentConfig } from './engine';

export function registerCrewsWithConfig(
  crews: Map<string, Crew>,
  configAgent: Record<string, unknown> | undefined,
  captainConfig?: CaptainConfig,
  allToolIds?: string[]
): Record<string, AgentConfig | unknown> {
  const crewAgents = crewsToAgentConfigs(crews, captainConfig, allToolIds);
  
  return {
    ...configAgent,
    ...crewAgents,
  };
}
