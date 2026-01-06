import { 
  fetchProjects, fetchStatus, updateProjectAutoIndex,
  fetchMemories, fetchDuplicates, purgeDuplicates as apiPurgeDuplicates,
  saveMemory as apiSaveMemory, deleteMemory as apiDeleteMemory, restoreMemory as apiRestoreMemory,
  runSearch as apiRunSearch,
  saveConfig as apiSaveConfig, fetchConfig as apiFetchConfig
} from './api';
import { compassState } from './stores.svelte';

export async function loadProjects() {
  try {
    compassState.projects = await fetchProjects(compassState.selectedProjectId);
  } catch (e) {
    console.error('Failed to fetch projects', e);
  }
}

export async function loadStatus() {
  compassState.loading = true;
  compassState.error = null;
  try {
    compassState.status = await fetchStatus(compassState.selectedProjectId);
  } catch (e: unknown) {
    compassState.error = e instanceof Error ? e.message : String(e);
  } finally {
    compassState.loading = false;
  }
}

export async function selectProject(id: number | null) {
  compassState.selectedProjectId = id;
  
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
  const projectId = compassState.selectedProjectId;
  if (!projectId) return;

  const project = compassState.projects.find(p => p.id === projectId);
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
  compassState.memoriesLoading = true;
  try {
    compassState.memories = await fetchMemories(compassState.selectedProjectId);
    compassState.duplicatesCount = await fetchDuplicates(compassState.selectedProjectId);
  } catch (e) {
    console.error('Failed to load memories:', e);
  } finally {
    compassState.memoriesLoading = false;
  }
}

export async function purgeDuplicates() {
  try {
    await apiPurgeDuplicates(compassState.selectedProjectId);
    compassState.duplicatesCount = 0;
    await loadMemories();
  } catch (e) {
    console.error('Failed to purge duplicates:', e);
  }
}

export async function saveMemoryAction() {
  if (!compassState.editingMemory) return;
  
  try {
    await apiSaveMemory(compassState.selectedProjectId, compassState.editingMemory.id, {
      content: compassState.editingMemory.content,
      concept_type: compassState.editingMemory.concept_type,
      domain: compassState.editingMemory.domain ?? null,
      confidence: compassState.editingMemory.confidence
    });
    
    const idx = compassState.memories.findIndex(m => m.id === compassState.editingMemory!.id);
    if (idx !== -1) {
      compassState.memories[idx] = { ...compassState.editingMemory };
    }
    compassState.editingMemory = null;
  } catch (e) {
    console.error('Failed to save memory:', e);
  }
}

export async function deleteMemoryAction(id: number) {
  try {
    await apiDeleteMemory(compassState.selectedProjectId, id);
    compassState.memories = compassState.memories.filter(m => m.id !== id);
    
    compassState.toast = { visible: true, deletedId: id };
    setTimeout(() => {
      if (compassState.toast.deletedId === id) {
        compassState.toast = { visible: false, deletedId: 0 };
      }
    }, 5000);
  } catch (e) {
    console.error('Failed to delete memory:', e);
  }
}

export async function restoreMemoryAction() {
  if (!compassState.toast.deletedId) return;
  
  try {
    await apiRestoreMemory(compassState.selectedProjectId, compassState.toast.deletedId);
    await loadMemories();
    compassState.toast = { visible: false, deletedId: 0 };
  } catch (e) {
    console.error('Failed to restore memory:', e);
  }
}

export async function searchAction() {
  if (!compassState.searchQuery.trim()) return;
  
  compassState.searchLoading = true;
  try {
    compassState.searchResults = await apiRunSearch(compassState.selectedProjectId, compassState.searchQuery);
  } catch (e) {
    console.error('Search failed:', e);
    compassState.searchResults = [];
  } finally {
    compassState.searchLoading = false;
  }
}

export async function loadConfigAction() {
  try {
    const data = await apiFetchConfig(compassState.selectedProjectId);
    if (data.embedding) {
      compassState.embeddingConfig = { ...data.embedding, hasApiKey: data.embedding.hasApiKey ?? false };
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
}

export async function saveConfigAction() {
  try {
    await apiSaveConfig(compassState.selectedProjectId, {
      provider: compassState.embeddingConfig.provider,
      geminiModel: compassState.embeddingConfig.geminiModel,
      dimensions: compassState.embeddingConfig.dimensions
    }, compassState.geminiApiKey || undefined);
    
    compassState.geminiApiKey = '';
    await loadConfigAction();
    return true;
  } catch (e) {
    console.error('Failed to save config:', e);
    return false;
  }
}
