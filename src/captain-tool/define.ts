import type {
  ParametersDefinition,
  ToolDefinition,
  ToolExecuteFn,
  ParameterSchema,
} from './types';

/**
 * Infer TypeScript type from ParameterSchema
 */
type InferParamType<T extends ParameterSchema> = T['type'] extends 'string'
  ? string
  : T['type'] extends 'number'
    ? number
    : T['type'] extends 'boolean'
      ? boolean
      : T['type'] extends 'array'
        ? unknown[]
        : T['type'] extends 'object'
          ? Record<string, unknown>
          : unknown;

/**
 * Infer params object type from ParametersDefinition
 * Required params are required, optional params are optional
 */
type InferParams<T extends ParametersDefinition> = {
  [K in keyof T as T[K]['required'] extends true ? K : never]: InferParamType<T[K]>;
} & {
  [K in keyof T as T[K]['required'] extends true ? never : K]?: InferParamType<T[K]>;
};

/**
 * Tool configuration passed to defineTool()
 */
interface ToolConfig<TParams extends ParametersDefinition> {
  description: string;
  parameters?: TParams;
  execute: ToolExecuteFn<InferParams<TParams>>;
}

/**
 * Factory function to create a type-safe tool definition.
 *
 * @example
 * ```typescript
 * import { defineTool } from '@captain/tools'
 *
 * export default defineTool({
 *   description: "Validate JSON against schema",
 *   parameters: {
 *     file: { type: 'string', required: true, description: 'JSON file path' },
 *     schema: { type: 'string', default: './schema.json' }
 *   },
 *   execute: async ({ file, schema }) => {
 *     // file is string, schema is string | undefined
 *     return { valid: true }
 *   }
 * })
 * ```
 */
export function defineTool<TParams extends ParametersDefinition = ParametersDefinition>(
  config: ToolConfig<TParams>
): ToolDefinition<InferParams<TParams>> {
  return {
    __isCaptainTool: true,
    description: config.description,
    parameters: config.parameters ?? ({} as ParametersDefinition),
    execute: config.execute as ToolExecuteFn<Record<string, unknown>>,
  };
}
