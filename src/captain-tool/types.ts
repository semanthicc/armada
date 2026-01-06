/**
 * Captain Tool - Dynamic Tool System Types
 *
 * Supports two patterns:
 * 1. defineTool() factory (recommended)
 * 2. Named exports (fallback)
 */

/** Supported parameter types for tool parameters */
export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/** Parameter schema definition */
export interface ParameterSchema {
  type: ParameterType;
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: string[];
}

/** Parameters definition - maps param names to schemas */
export type ParametersDefinition = Record<string, ParameterSchema>;

/** Tool execution result */
export type ToolResult = unknown;

/** Tool execute function signature */
export type ToolExecuteFn<TParams extends Record<string, unknown> = Record<string, unknown>> = (
  params: TParams
) => Promise<ToolResult> | ToolResult;

/**
 * Tool definition created by defineTool()
 * This is what a tool file exports as default
 */
export interface ToolDefinition<TParams extends Record<string, unknown> = Record<string, unknown>> {
  __isCaptainTool: true;
  description: string;
  parameters: ParametersDefinition;
  execute: ToolExecuteFn<TParams>;
}

/**
 * Raw tool module - what we get from dynamic import
 * Supports both defineTool() wrapper and naked exports
 */
export interface ToolModule {
  // defineTool() pattern - default export is ToolDefinition
  default?: ToolDefinition | ToolExecuteFn;

  // Naked exports pattern
  description?: string;
  parameters?: ParametersDefinition;

  // Flag to explicitly expose sub-tools
  exposed?: boolean;
}

/**
 * Resolved tool info after discovery
 */
export interface ResolvedTool {
  /** Full tool path: category/tool or category/workflow/tool */
  path: string;

  /** Absolute filesystem path to the .ts file */
  filePath: string;

  /** Tool description */
  description: string;

  /** Parameter definitions */
  parameters: ParametersDefinition;

  /** The execute function */
  execute: ToolExecuteFn;
}

/**
 * Tool discovery result from scanning scrolls directories
 */
export interface DiscoveredTool {
  /** Tool identifier path */
  path: string;

  /** Absolute path to .ts file */
  filePath: string;

  /** Category (top-level folder) */
  category: string | null;

  /** Workflow name if workflow-specific tool */
  workflow: string | null;

  /** Tool name (filename without .ts) */
  name: string;
}

/**
 * Tool execution error
 */
export interface ToolError {
  error: string;
  details?: string;
  stack?: string;
}

/**
 * Result of captain_tool execution
 */
export type CaptainToolResult = ToolResult | ToolError;

/**
 * Type guard to check if result is an error
 */
export function isToolError(result: CaptainToolResult): result is ToolError {
  return typeof result === 'object' && result !== null && 'error' in result;
}

/**
 * Type guard to check if module uses defineTool pattern
 */
export function isToolDefinition(value: unknown): value is ToolDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__isCaptainTool' in value &&
    (value as ToolDefinition).__isCaptainTool === true
  );
}
