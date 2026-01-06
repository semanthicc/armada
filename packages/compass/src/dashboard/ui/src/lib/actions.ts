import { 
  fetchProjects, fetchStatus, updateProjectAutoIndex,
  fetchMemories, fetchDuplicates, purgeDuplicates as apiPurgeDuplicates,
  saveMemory as apiSaveMemory, deleteMemory as apiDeleteMemory, restoreMemory as apiRestoreMemory,
  runSearch as apiRunSearch,
  saveConfig as apiSaveConfig, fetchConfig as apiFetchConfig
} from './api';
import { appState } from './stores';

export async function loadProjects() {
  try {
    appState.projects = await fetchProjects(appState.selectedProjectId);
  } catch (e) {
    console.error('Failed to fetch projects', e);
  }
}

export async function loadStatus() {
  appState.loading = true;
  appState.error = null;
  try {
    appState.status = await fetchStatus(appState.selectedProjectId);
  } catch (e: unknown) {
    appState.error = e instanceof Error ? e.message : String(e);
  } finally {
    appState.loading = false;
  }
}

export async function selectProject(id: number | null) {
  appState.selectedProjectId = id;
  
  const url = new URL(window.location.href);
  if (id) {
    url.searchParams.set('project', String(id));
  } else {
    url.searchParams.delete('project');
  }
  window.history.pushState({}, '', url.toString());
  
  await loadStatus();
}

export async function toggleAutoIndex() {
  const projectId = appState.selectedProjectId;
  if (!projectId) return;

  const project = appState.projects.find(p => p.id === projectId);
  if (!project) return;

  const newVal = !project.auto_index;
  
  try {
    await updateProjectAutoIndex(projectId, newVal);
    project.auto_index = newVal;
  } catch (e) {
    console.error('Failed to toggle auto-index', e);
  }
}

export async function refresh() {
  await loadStatus();
  await loadProjects();
}

export async function loadMemories() {
  appState.memoriesLoading = true;
  try {
    appState.memories = await fetchMemories(appState.selectedProjectId);
    appState.duplicatesCount = await fetchDuplicates(appState.selectedProjectId);
  } catch (e) {
    console.error('Failed to load memories:', e);
  } finally {
    appState.memoriesLoading = false;
  }
}

export async function purgeDuplicates() {
  try {
    await apiPurgeDuplicates(appState.selectedProjectId);
    appState.duplicatesCount = 0;
    await loadMemories();
  } catch (e) {
    console.error('Failed to purge duplicates:', e);
  }
}

export async function saveMemoryAction() {
  if (!appState.editingMemory) return;
  
  try {
    await apiSaveMemory(appState.selectedProjectId, appState.editingMemory.id, {
      content: appState.editingMemory.content,
      concept_type: appState.editingMemory.concept_type,
      domain: appState.editingMemory.domain ?? null,
      confidence: appState.editingMemory.confidence
    });
    
    const idx = appState.memories.findIndex(m => m.id === appState.editingMemory!.id);
    if (idx !== -1) {
      appState.memories[idx] = { ...appState.editingMemory };
    }
    appState.editingMemory = null;
  } catch (e) {
    console.error('Failed to save memory:', e);
  }
}

export async function deleteMemoryAction(id: number) {
  try {
    await apiDeleteMemory(appState.selectedProjectId, id);
    appState.memories = appState.memories.filter(m => m.id !== id);
    
    appState.toast = { visible: true, deletedId: id };
    setTimeout(() => {
      if (appState.toast.deletedId === id) {
        appState.toast = { visible: false, deletedId: 0 };
      }
    }, 5000);
  } catch (e) {
    console.error('Failed to delete memory:', e);
  }
}

export async function restoreMemoryAction() {
  if (!appState.toast.deletedId) return;
  
  try {
    await apiRestoreMemory(appState.selectedProjectId, appState.toast.deletedId);
    await loadMemories();
    appState.toast = { visible: false, deletedId: 0 };
  } catch (e) {
    console.error('Failed to restore memory:', e);
  }
}

export async function searchAction() {
  if (!appState.searchQuery.trim()) return;
  
  appState.searchLoading = true;
  try {
    appState.searchResults = await apiRunSearch(appState.selectedProjectId, appState.searchQuery);
  } catch (e) {
    console.error('Search failed:', e);
    appState.searchResults = [];
  } finally {
    appState.searchLoading = false;
  }
}

export async function loadConfigAction() {
  try {
    const data = await apiFetchConfig(appState.selectedProjectId);
    if (data.embedding) {
      appState.embeddingConfig = { ...data.embedding, hasApiKey: data.embedding.hasApiKey ?? false };
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

export async function saveConfigAction() {
  try {
    await apiSaveConfig(appState.selectedProjectId, {
      provider: appState.embeddingConfig.provider,
      geminiModel: appState.embeddingConfig.geminiModel,
      dimensions: appState.embeddingConfig.dimensions
    }, appState.geminiApiKey || undefined);
    
    appState.geminiApiKey = '';
    await loadConfigAction();
    return true;
  } catch (e) {
    console.error('Failed to save config:', e);
    return false;
  }
}
