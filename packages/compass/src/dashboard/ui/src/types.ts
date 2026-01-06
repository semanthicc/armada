export interface Memory {
  id: number;
  content: string;
  concept_type: 'pattern' | 'rule' | 'constraint' | 'decision' | 'context' | 'learning';
  domain?: string;
  confidence: number;
  project_id: number | null;
  created_at: number;
  updated_at: number;
  keywords?: string;
}

export interface SearchResult {
  id: number;
  content: string;
  filePath: string;
  chunkStart: number;
  chunkEnd: number;
  similarity: number;
  chunkType: 'code' | 'doc';
}

export interface EmbeddingConfig {
  provider: string;
  geminiModel: string;
  dimensions: number | null;
  hasApiKey?: boolean;
}

export interface IndexStats {
  chunkCount: number;
  lastIndexedAt: number | null;
  embeddingConfig?: {
    provider: string;
    model: string;
    dimensions: number;
  } | null;
}

export interface IndexCoverage {
  totalFiles: number;
  indexedFiles: number;
  staleFiles: number;
  coveragePercent: number;
  staleFilesCount?: number;
}

export interface StatusResponse {
  projectId: number | null;
  projectName: string | null;
  projectPath: string | null;
  dashboardPort: number | null;
  memories: {
    total: number;
    golden: number;
    passive: number;
    avgConfidence: number;
    minConfidence: number;
    maxConfidence: number;
  };
  typeBreakdown: {
    concept_type: string;
    count: number;
  }[];
  index?: IndexStats;
  coverage?: IndexCoverage | null;
  embeddingWarning?: {
    type: string;
    message: string;
    storedProvider: string;
    storedDimensions: number;
    currentProvider: string;
    currentDimensions: number;
  } | null;
}

export interface Project {
  id: number;
  name: string;
  path: string;
  chunk_count: number;
  auto_index: boolean;
}

export interface Toast {
  visible: boolean;
  id: number | null;
}
