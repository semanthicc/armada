import type { 
  Memory, SearchResult, EmbeddingConfig, StatusResponse, 
  Project 
} from './types';

export function buildApiUrl(path: string, projectId: number | null): string {
  if (!projectId) return path;
  return path + (path.includes('?') ? '&' : '?') + 'project_id=' + projectId;
}

export async function fetchWithRetry(
  url: string | URL, 
  options: RequestInit = {}, 
  retries = 3, 
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok && res.status >= 500) throw new Error(res.statusText);
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Fetch failed');
}

export async function fetchProjects(projectId: number | null): Promise<Project[]> {
  const res = await fetchWithRetry(buildApiUrl('/api/projects', projectId));
  if (res.ok) return res.json() as Promise<Project[]>;
  return [];
}

export async function fetchStatus(projectId: number | null): Promise<StatusResponse> {
  const res = await fetchWithRetry(buildApiUrl('/api/status', projectId));
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<StatusResponse>;
}

export async function fetchMemories(projectId: number | null): Promise<Memory[]> {
  const res = await fetch(buildApiUrl('/api/memories', projectId));
  return res.json() as Promise<Memory[]>;
}

export async function fetchDuplicates(projectId: number | null): Promise<number> {
  const res = await fetch(buildApiUrl('/api/duplicates', projectId));
  const data = await res.json() as unknown[];
  return data.length;
}

export async function purgeDuplicates(projectId: number | null): Promise<{ deleted: number }> {
  const res = await fetch(buildApiUrl('/api/duplicates', projectId), { method: 'DELETE' });
  return res.json() as Promise<{ deleted: number }>;
}

export async function fetchConfig(projectId: number | null): Promise<{ embedding?: EmbeddingConfig }> {
  const res = await fetchWithRetry(buildApiUrl('/api/config', projectId));
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{ embedding?: EmbeddingConfig }>;
}

export async function saveConfig(
  projectId: number | null,
  config: { provider: string; geminiModel: string; dimensions: number | null },
  apiKey?: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    embedding: {
      provider: config.provider,
      geminiModel: config.geminiModel,
      dimensions: config.dimensions ? Number(config.dimensions) : null
    }
  };

  if (config.provider === 'gemini' && apiKey) {
    (payload.embedding as Record<string, unknown>).geminiApiKey = apiKey;
  }

  const res = await fetch(buildApiUrl('/api/config', projectId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(res.statusText);
}

export async function deleteIndex(projectId: number | null): Promise<void> {
  const res = await fetch(buildApiUrl('/api/index', projectId), { method: 'DELETE' });
  if (!res.ok) throw new Error(res.statusText);
}

export async function stopIndex(projectId: number | null): Promise<void> {
  const res = await fetch(buildApiUrl('/api/index/stop', projectId), { method: 'POST' });
  if (!res.ok) throw new Error(res.statusText);
}

export async function updateProjectAutoIndex(projectId: number, autoIndex: boolean): Promise<void> {
  await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_index: autoIndex })
  });
}

export async function saveMemory(
  projectId: number | null,
  memoryId: number, 
  data: { content: string; concept_type: string; domain: string | null; confidence: number }
): Promise<void> {
  const res = await fetch(buildApiUrl(`/api/memories/${memoryId}`, projectId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(res.statusText);
}

export async function deleteMemory(projectId: number | null, id: number): Promise<{ id: number }> {
  const res = await fetch(buildApiUrl(`/api/memories/${id}`, projectId), { method: 'DELETE' });
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{ id: number }>;
}

export async function restoreMemory(projectId: number | null, id: number): Promise<void> {
  const res = await fetch(buildApiUrl(`/api/memories/${id}/restore`, projectId), { method: 'POST' });
  if (!res.ok) throw new Error(res.statusText);
}

export async function runSearch(projectId: number | null, query: string): Promise<SearchResult[]> {
  const res = await fetch(buildApiUrl(`/api/search?q=${encodeURIComponent(query)}`, projectId));
  return res.json() as Promise<SearchResult[]>;
}

export type IndexProgressEvent = 
  | { type: 'progress'; processedFiles: number; totalFiles: number; totalChunks: number }
  | { type: 'complete'; result: { filesIndexed: number; chunksCreated: number; errorCount?: number; errors?: Array<{file: string; error: string}>; durationMs: number } }
  | { type: 'aborted' }
  | { type: 'error'; error: string };

export async function indexProject(
  projectId: number | null,
  onProgress: (event: IndexProgressEvent) => void
): Promise<void> {
  const res = await fetch(buildApiUrl('/api/index', projectId), { method: 'POST' });
  if (!res.ok) throw new Error(res.statusText);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6)) as IndexProgressEvent;
          onProgress(data);
        } catch (e) {
          console.error('Error parsing SSE data:', e);
        }
      }
    }
  }
}
