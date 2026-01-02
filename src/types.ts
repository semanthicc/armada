export type ConceptType = 
  | "pattern" 
  | "decision" 
  | "constraint" 
  | "learning" 
  | "context" 
  | "rule";

export type MemoryStatus = 
  | "current" 
  | "superseded" 
  | "archived" 
  | "dead_end";

export type MemorySource = 
  | "explicit" 
  | "passive";

export type ProjectType = 
  | "active" 
  | "reference" 
  | "archived";

export interface Project {
  id: number;
  path: string;
  name: string | null;
  type: ProjectType;
  last_indexed_at: number | null;
  chunk_count: number;
  memory_count: number;
  created_at: number;
  updated_at: number;
}

export interface Memory {
  id: number;
  concept_type: ConceptType;
  content: string;
  domain: string | null;
  project_id: number | null;
  confidence: number;
  times_validated: number;
  times_violated: number;
  is_golden: boolean;
  last_validated_at: number | null;
  status: MemoryStatus;
  superseded_by: number | null;
  evolved_from: number | null;
  evolution_note: string | null;
  superseded_at: number | null;
  source: MemorySource;
  source_session_id: string | null;
  source_tool: string | null;
  created_at: number;
  updated_at: number;
}

export interface MemoryWithEffectiveConfidence extends Memory {
  effectiveConfidence: number;
}

export interface CreateMemoryInput {
  concept_type: ConceptType;
  content: string;
  domain?: string;
  project_id?: number | null;
  source?: MemorySource;
  source_session_id?: string;
  source_tool?: string;
}
