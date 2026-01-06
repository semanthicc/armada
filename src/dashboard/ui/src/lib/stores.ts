import type { 
  Memory, SearchResult, EmbeddingConfig, StatusResponse, 
  Project, IndexCoverage, Toast 
} from '../types';

// Re-export types for convenience
export type { Memory, SearchResult, EmbeddingConfig, StatusResponse, Project, IndexCoverage, Toast };

// Shared state store using Svelte 5 runes
// These are created as module-level reactive state

export function createAppStore() {
  // Core state
  let status = $state<StatusResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let embeddingWarning = $state<StatusResponse['embeddingWarning']>(null);

  // Project state
  let projects = $state<Project[]>([]);
  let selectedProjectId = $state<number | null>(null);
  let coverage = $state<IndexCoverage | null>(null);

  // Tab state
  let tab = $state<'overview' | 'memories' | 'search' | 'settings'>('overview');

  // Search state
  let searchQuery = $state('');
  let searchResults = $state<SearchResult[]>([]);
  let searchLoading = $state(false);

  // Memories state
  let memories = $state<Memory[]>([]);
  let memoriesLoading = $state(false);
  let editingMemory = $state<Memory | null>(null);
  let duplicatesCount = $state(0);
  let filter = $state<'all' | 'project' | 'global'>('all');

  // Index state
  let indexing = $state(false);
  let forceIndexing = $state(false);
  let deletingIndex = $state(false);
  let indexMsg = $state<string | null>(null);
  let indexMsgType = $state<'success' | 'error' | 'warning' | 'info'>('success');
  let indexProgress = $state(0);
  let indexStatusText = $state('');
  let indexErrors = $state<Array<{file: string, error: string}>>([]);
  let showErrors = $state(false);
  let autoIndexTriggered = $state(false);

  // Config state
  let embeddingConfig = $state<EmbeddingConfig>({ 
    provider: 'local', 
    geminiModel: 'gemini-embedding-001', 
    dimensions: null, 
    hasApiKey: false 
  });
  let geminiApiKey = $state('');
  let configSaving = $state(false);
  let configMsg = $state<string | null>(null);
  let configMsgType = $state<'success' | 'error'>('success');

  // Toast state
  let toast = $state<Toast>({ visible: false, id: null });

  return {
    // Getters/setters for all state
    get status() { return status; },
    set status(v) { status = v; },
    
    get loading() { return loading; },
    set loading(v) { loading = v; },
    
    get error() { return error; },
    set error(v) { error = v; },
    
    get embeddingWarning() { return embeddingWarning; },
    set embeddingWarning(v) { embeddingWarning = v; },
    
    get projects() { return projects; },
    set projects(v) { projects = v; },
    
    get selectedProjectId() { return selectedProjectId; },
    set selectedProjectId(v) { selectedProjectId = v; },
    
    get coverage() { return coverage; },
    set coverage(v) { coverage = v; },
    
    get tab() { return tab; },
    set tab(v) { tab = v; },
    
    get searchQuery() { return searchQuery; },
    set searchQuery(v) { searchQuery = v; },
    
    get searchResults() { return searchResults; },
    set searchResults(v) { searchResults = v; },
    
    get searchLoading() { return searchLoading; },
    set searchLoading(v) { searchLoading = v; },
    
    get memories() { return memories; },
    set memories(v) { memories = v; },
    
    get memoriesLoading() { return memoriesLoading; },
    set memoriesLoading(v) { memoriesLoading = v; },
    
    get editingMemory() { return editingMemory; },
    set editingMemory(v) { editingMemory = v; },
    
    get duplicatesCount() { return duplicatesCount; },
    set duplicatesCount(v) { duplicatesCount = v; },
    
    get filter() { return filter; },
    set filter(v) { filter = v; },
    
    get indexing() { return indexing; },
    set indexing(v) { indexing = v; },
    
    get forceIndexing() { return forceIndexing; },
    set forceIndexing(v) { forceIndexing = v; },
    
    get deletingIndex() { return deletingIndex; },
    set deletingIndex(v) { deletingIndex = v; },
    
    get indexMsg() { return indexMsg; },
    set indexMsg(v) { indexMsg = v; },
    
    get indexMsgType() { return indexMsgType; },
    set indexMsgType(v) { indexMsgType = v; },
    
    get indexProgress() { return indexProgress; },
    set indexProgress(v) { indexProgress = v; },
    
    get indexStatusText() { return indexStatusText; },
    set indexStatusText(v) { indexStatusText = v; },
    
    get indexErrors() { return indexErrors; },
    set indexErrors(v) { indexErrors = v; },
    
    get showErrors() { return showErrors; },
    set showErrors(v) { showErrors = v; },
    
    get autoIndexTriggered() { return autoIndexTriggered; },
    set autoIndexTriggered(v) { autoIndexTriggered = v; },
    
    get embeddingConfig() { return embeddingConfig; },
    set embeddingConfig(v) { embeddingConfig = v; },
    
    get geminiApiKey() { return geminiApiKey; },
    set geminiApiKey(v) { geminiApiKey = v; },
    
    get configSaving() { return configSaving; },
    set configSaving(v) { configSaving = v; },
    
    get configMsg() { return configMsg; },
    set configMsg(v) { configMsg = v; },
    
    get configMsgType() { return configMsgType; },
    set configMsgType(v) { configMsgType = v; },
    
    get toast() { return toast; },
    set toast(v) { toast = v; },
  };
}
