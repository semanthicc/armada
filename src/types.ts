export interface TagOrGroup {
  or: string[];
}

export type TagEntry = string | (string | TagOrGroup)[] | TagOrGroup;

export type AutomentionMode = 'true' | 'expanded' | 'false';

export type WorkflowInWorkflowMode = 'true' | 'hints' | 'false';

export interface SpawnAtEntry {
  agent: string;
  mode: 'hint' | 'expanded';
}

export interface Workflow {
  name: string;
  aliases: string[];
  tags: TagEntry[];
  onlyFor: string[];
  spawnAt: SpawnAtEntry[];
  description: string;
  automention: AutomentionMode;
  workflowInWorkflow: WorkflowInWorkflowMode;
  content: string;
  source: 'project' | 'global';
  path: string;
  folder?: string;
}

export interface ParsedFrontmatter {
  aliases: string[];
  tags: TagEntry[];
  onlyFor: string[];
  spawnAt: SpawnAtEntry[];
  description: string;
  automention: AutomentionMode;
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
  expandedApply: string[];
  matchedKeywords: Map<string, string[]>;
}

export interface SpawnMatchResult {
  hints: string[];
  expanded: string[];
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
