import type { Rule } from './types';

export function filterRulesByAgent(rules: Map<string, Rule>, activeAgent?: string): Rule[] {
  const filtered: Rule[] = [];
  const seen = new Set<string>();
  
  for (const rule of rules.values()) {
    if (seen.has(rule.name)) continue;
    seen.add(rule.name);
    
    if (rule.onlyFor.length === 0) {
      filtered.push(rule);
    } else if (activeAgent && rule.onlyFor.includes(activeAgent)) {
      filtered.push(rule);
    }
  }
  
  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

export function buildRulesSystemPrompt(rules: Rule[]): string {
  if (rules.length === 0) return '';
  
  const parts: string[] = [];
  
  for (const rule of rules) {
    parts.push(`<rule name="${rule.name}" source="${rule.source}">\n${rule.content}\n</rule>`);
  }
  
  return '\n\n' + parts.join('\n\n');
}
