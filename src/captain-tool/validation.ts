import type { ParametersDefinition, ToolError } from './types';

interface ValidationResult {
  valid: true;
  params: Record<string, unknown>;
}

export function validateParams(
  parameters: ParametersDefinition,
  input: Record<string, unknown>
): ValidationResult | ToolError {
  const result: Record<string, unknown> = {};
  const missingRequired: string[] = [];
  const typeErrors: string[] = [];

  for (const [name, schema] of Object.entries(parameters)) {
    const value = input[name];

    if (value === undefined) {
      if (schema.required) {
        missingRequired.push(name);
        continue;
      }
      if (schema.default !== undefined) {
        result[name] = schema.default;
        continue;
      }
      continue;
    }

    const actualType = Array.isArray(value) ? 'array' : typeof value;
    const expectedType = schema.type;

    if (actualType !== expectedType) {
      typeErrors.push(`${name}: expected ${expectedType}, got ${actualType}`);
      continue;
    }

    if (schema.enum && !schema.enum.includes(String(value))) {
      typeErrors.push(`${name}: must be one of [${schema.enum.join(', ')}], got "${value}"`);
      continue;
    }

    result[name] = value;
  }

  if (missingRequired.length > 0) {
    return { error: `Missing required parameters: ${missingRequired.join(', ')}` };
  }

  if (typeErrors.length > 0) {
    return { error: `Parameter validation failed: ${typeErrors.join('; ')}` };
  }

  return { valid: true, params: result };
}
