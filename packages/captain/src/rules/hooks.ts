import type { Rule } from './types';
import { filterRulesByAgent, buildRulesSystemPrompt } from './engine';

export function processRulesForAgent(
  rules: Map<string, Rule>,
  activeAgent?: string
): string {
  const matchingRules = filterRulesByAgent(rules, activeAgent);
  return buildRulesSystemPrompt(matchingRules);
}
