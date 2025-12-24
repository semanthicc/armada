export interface TagOrGroup {
  or: string[];
}

export type TagEntry = string | (string | TagOrGroup)[] | TagOrGroup;

export type AutoworkflowMode = 'true' | 'hintForUser' | 'false';

export type WorkflowInWorkflowMode = 'true' | 'hints' | 'false';

export interface Workflow {
  name: string;
  aliases: string[];
  tags: TagEntry[];
  agents: string[];
  description: string;
  autoworkflow: AutoworkflowMode;
  workflowInWorkflow: WorkflowInWorkflowMode;
  content: string;
  source: 'project' | 'global';
  path: string;
  folder?: string;
}

export interface ParsedFrontmatter {
  aliases: string[];
  tags: TagEntry[];
  agents: string[];
  description: string;
  autoworkflow: AutoworkflowMode;
  workflowInWorkflow: WorkflowInWorkflowMode;
  body: string;
}

export interface WorkflowConfig {
  deduplicateSameMessage: boolean;
  maxNestingDepth: number;
}

export interface WorkflowRef {
  id: string;
  messageID: string;
  implicit?: boolean;
}

export interface AutoWorkflowMatchResult {
  autoApply: string[];
  userHints: string[];
  matchedKeywords: Map<string, string[]>;
}

export interface ExpansionResult {
  text: string;
  found: string[];
  reused: string[];
  notFound: string[];
  suggestions: Map<string, string[]>;
  hints: string[];
  warnings: string[];
  newRefs: Map<string, WorkflowRef>;
}

export interface NestedExpansionResult {
  content: string;
  nestedWorkflows: string[];
  hints: string[];
  warnings: string[];
  newRefs: Map<string, WorkflowRef>;
}

export type VariableResolver = () => string;

export interface PluginEvent {
  type: string;
  properties?: {
    sessionID?: string;
    messageID?: string;
    [key: string]: unknown;
  };
}
