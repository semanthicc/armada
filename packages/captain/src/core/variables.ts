import type { VariableResolver } from './types';

export const BUILTIN_VARIABLES: Record<string, VariableResolver> = {
  TODAY: () => new Date().toISOString().split('T')[0],
  NOW: () => new Date().toISOString().replace('T', ' ').split('.')[0],
};

export function expandVariables(
  content: string,
  extraVars?: Record<string, VariableResolver>
): string {
  const allVars = { ...BUILTIN_VARIABLES, ...extraVars };

  return content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    const resolver = allVars[name];
    if (!resolver) return match;
    try {
      return resolver();
    } catch {
      return match;
    }
  });
}
