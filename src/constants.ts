export const ALL_CONCEPT_TYPES = [
  "pattern",
  "rule",
  "constraint",
  "decision",
  "context",
  "learning"
] as const;

// Types that should be injected into the LLM context as heuristics
// "learning" is excluded here because it's handled separately as failure warnings
export const INJECTABLE_CONCEPT_TYPES = [
  "pattern",
  "rule",
  "constraint",
  "decision",
  "context"
] as const;

export type ConceptType = typeof ALL_CONCEPT_TYPES[number];

// Maps file extensions to domain names for domain-aware heuristic injection
export const EXTENSION_DOMAIN_MAP: Record<string, string> = {
  // Frontend frameworks
  ".svelte": "svelte",
  ".vue": "vue",
  ".tsx": "react",
  ".jsx": "react",
  
  // Languages
  ".ts": "typescript",
  ".js": "javascript",
  ".py": "python",
  ".go": "golang",
  ".rs": "rust",
  ".rb": "ruby",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".c": "c",
  ".php": "php",
  
  // Config/Data
  ".sql": "sql",
  ".graphql": "graphql",
  ".gql": "graphql",
  
  // Styles
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".less": "less",
};
