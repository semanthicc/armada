import type { 
  Memory, SearchResult, EmbeddingConfig, StatusResponse, 
  Project, IndexCoverage, Toast 
} from '../types';

export type { Memory, SearchResult, EmbeddingConfig, StatusResponse, Project, IndexCoverage, Toast };

export const appState = $state({
  status: null as StatusResponse | null,
  loading: true,
  error: null as string | null,
  
  projects: [] as Project[],
  selectedProjectId: null as number | null,
  
  searchQuery: '',
  searchResults: [] as SearchResult[],
  searchLoading: false,
  
  memories: [] as Memory[],
  memoriesLoading: false,
  editingMemory: null as Memory | null,
  duplicatesCount: 0,
  filter: 'all' as 'all' | 'project' | 'global',
  
  embeddingConfig: { 
    provider: 'local', 
    geminiModel: 'gemini-embedding-001', 
    dimensions: null, 
    hasApiKey: false 
  } as EmbeddingConfig,
  geminiApiKey: '',
  
  toast: { visible: false, deletedId: 0 } as { visible: boolean; deletedId: number },
});

export function getCurrentProject() {
  return appState.projects.find(p => p.id === appState.selectedProjectId);
}

export function getCurrentAutoIndex() {
  return getCurrentProject()?.auto_index ?? false;
}
