<script lang="ts">
  import type { 
    Memory, SearchResult, EmbeddingConfig, StatusResponse, 
    Project, IndexCoverage, Toast 
  } from './types';

  let status = $state<StatusResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let embeddingWarning = $state<StatusResponse['embeddingWarning']>(null);

  let projects = $state<Project[]>([]);
  let selectedProjectId = $state<number | null>(null);
  let coverage = $state<IndexCoverage | null>(null);

  function api(path: string) {
    if (!selectedProjectId) return path;
    return path + (path.includes('?') ? '&' : '?') + 'project_id=' + selectedProjectId;
  }

  async function fetchWithRetry(url: string | URL, options: RequestInit = {}, retries = 3, delay = 1000) {
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

  async function fetchProjects() {
    try {
      const res = await fetchWithRetry(api('/api/projects'));
      if (res.ok) projects = await res.json();
    } catch (e) {
      console.error('Failed to fetch projects', e);
    }
  }

  function switchProject() {
    const url = new URL(window.location.href);
    if (selectedProjectId) {
      url.searchParams.set('project', String(selectedProjectId));
    } else {
      url.searchParams.delete('project');
    }
    window.history.pushState({}, '', url);
  }

  // Init
  const urlParams = new URLSearchParams(window.location.search);
  const pidParam = urlParams.get('project');
  if (pidParam) selectedProjectId = Number(pidParam);
  fetchProjects();

  let tab = $state('overview');
  
  let searchQuery = $state('');
  let searchResults = $state<SearchResult[]>([]);
  let searchLoading = $state(false);

  let memories = $state<Memory[]>([]);
  let memoriesLoading = $state(false);

  let editingMemory = $state<Memory | null>(null);
  let duplicatesCount = $state(0);
  
  let indexing = $state(false);
  let forceIndexing = $state(false);
  let deletingIndex = $state(false);
  let indexMsg = $state<string | null>(null);
  let indexMsgType = $state('success');
  let indexProgress = $state(0);
  let indexStatusText = $state('');
  let indexErrors = $state<Array<{file: string, error: string}>>([]);
  let showErrors = $state(false);

  let embeddingConfig = $state<EmbeddingConfig>({ provider: 'local', geminiModel: 'gemini-embedding-001', dimensions: null, hasApiKey: false });
  let geminiApiKey = $state('');
  let configSaving = $state(false);
  let configMsg = $state<string | null>(null);
  let configMsgType = $state('success');

  let toast = $state<Toast>({ visible: false, id: null });
  let filter = $state('all');
  let filteredMemories = $derived.by(() => {
    const result = memories.filter(m => {
      if (filter === 'project') return m.project_id !== null;
      if (filter === 'global') return m.project_id === null;
      return true;
    });
    console.log('[debug] Filter:', filter, 'Filtered count:', result.length);
    return result;
  });

  async function fetchDuplicates() {
    try {
      console.log('[debug] Fetching duplicates...');
      const res = await fetch(api('/api/duplicates'));
      const data = await res.json();
      duplicatesCount = data.length;
    } catch (e) {
      console.error('Failed to fetch duplicates', e);
    }
  }

  async function purgeDuplicates() {
    if (!confirm(`Purge ${duplicatesCount} duplicate groups?`)) return;
    console.log('[debug] Purging duplicates...');
    try {
      const res = await fetch(api('/api/duplicates'), { method: 'DELETE' });
      const data = await res.json();
      alert(`Deleted ${data.deleted} duplicates.`);
      fetchMemories();
      fetchDuplicates();
    } catch (e: unknown) {
      alert('Failed to purge: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function deleteIndex() {
    if (!confirm('Are you sure you want to delete the semantic index? Search will stop working until you re-index.')) return;
    
    deletingIndex = true;
    indexMsg = null;
    console.log('[debug] Deleting index...');
    
    try {
      const res = await fetch(api('/api/index'), { method: 'DELETE' });
      
      if (!res.ok) throw new Error(res.statusText);
      
      indexMsg = 'Index deleted successfully.';
      indexMsgType = 'success';
      fetchStatus();
    } catch (e: unknown) {
      console.error(e);
      indexMsg = 'Failed to delete index: ' + (e instanceof Error ? e.message : String(e));
      indexMsgType = 'error';
    } finally {
      deletingIndex = false;
    }
  }

  async function fetchConfig() {
    try {
      const res = await fetchWithRetry(api('/api/config'));
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      if (data.embedding) {
        embeddingConfig = {
          ...embeddingConfig,
          ...data.embedding
        };
      }
    } catch (e) {
      console.error('Failed to fetch config', e);
    }
  }

  async function saveConfig() {
    configSaving = true;
    configMsg = null;
    try {
      const payload: any = {
        embedding: {
          provider: embeddingConfig.provider,
          geminiModel: embeddingConfig.geminiModel,
          dimensions: embeddingConfig.dimensions ? Number(embeddingConfig.dimensions) : null
        }
      };

      if (embeddingConfig.provider === 'gemini' && geminiApiKey) {
        payload.embedding.geminiApiKey = geminiApiKey;
      }

      const res = await fetch(api('/api/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(res.statusText);
      
      configMsg = 'Settings saved successfully.';
      configMsgType = 'success';
      geminiApiKey = ''; // Clear API key from state for security
      fetchConfig(); // Refresh to get updated hasApiKey status
    } catch (e: unknown) {
      configMsg = 'Failed to save settings: ' + (e instanceof Error ? e.message : String(e));
      configMsgType = 'error';
    } finally {
      configSaving = false;
    }
  }

  async function indexProject() {
    indexing = true;
    indexMsg = null;
    indexProgress = 0;
    indexStatusText = 'Starting scan...';
    console.log('[debug] Starting index...');
    
    try {
      const res = await fetch(api('/api/index'), { method: 'POST' });
      
      if (!res.ok) throw new Error(res.statusText);
      
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep the last incomplete chunk
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                indexProgress = Math.round((data.processedFiles / data.totalFiles) * 100);
                indexStatusText = `Scanning: ${data.processedFiles}/${data.totalFiles} files (${data.totalChunks} chunks)`;
              } else if (data.type === 'complete') {
                const result = data.result;
                if (result.errorCount && result.errorCount > 0) {
                  indexMsg = `Indexed ${result.filesIndexed} files (${result.chunksCreated} chunks) with ${result.errorCount} errors.`;
                  indexMsgType = 'warning';
                  indexErrors = result.errors || [];
                  showErrors = false;
                } else {
                  indexMsg = `Indexed ${result.filesIndexed} files (${result.chunksCreated} chunks) in ${(result.durationMs/1000).toFixed(1)}s`;
                  indexMsgType = 'success';
                  indexErrors = [];
                }
                indexProgress = 100;
                indexStatusText = 'Complete!';
                fetchStatus();
              } else if (data.type === 'aborted') {
                indexMsg = 'Indexing aborted by user.';
                indexMsgType = 'info';
                indexStatusText = 'Aborted';
                fetchStatus();
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (e: unknown) {
      console.error(e);
      if (indexStatusText !== 'Aborted') {
        indexMsg = 'Indexing failed: ' + (e instanceof Error ? e.message : String(e));
        indexMsgType = 'error';
        indexStatusText = 'Failed';
      }
    } finally {
      indexing = false;
    }
  }

  async function stopIndex() {
    try {
      const res = await fetch(api('/api/index/stop'), { method: 'POST' });
      if (!res.ok) throw new Error(res.statusText);
      indexStatusText = 'Stopping...';
    } catch (e: unknown) {
      console.error('Failed to stop index', e);
    }
  }

  function startEdit(m: Memory) {
    editingMemory = { ...m };
  }

  async function saveEdit() {
    if (!editingMemory) return;
    console.log('[debug] Saving memory...', editingMemory.id);
    try {
      const res = await fetch(api(`/api/memories/${editingMemory.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: editingMemory.content,
          concept_type: editingMemory.concept_type,
          domain: editingMemory.domain,
          confidence: Number(editingMemory.confidence)
        })
      });
      if (!res.ok) throw new Error(res.statusText);
      editingMemory = null;
      fetchMemories();
    } catch (e: unknown) {
      alert('Failed to save: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  let autoIndexTriggered = $state(false);
  
  async function fetchStatus() {
    try {
      const res = await fetchWithRetry(api('/api/status'));
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      status = data;
      embeddingWarning = data.embeddingWarning || null;
      
      if (data.coverage?.staleFiles > 0 && !indexing && !embeddingWarning && !autoIndexTriggered) {
        console.log(`[auto-index] Detected ${data.coverage.staleFiles} stale files, triggering sync`);
        autoIndexTriggered = true;
        indexProject();
      } else if (data.coverage?.staleFiles === 0) {
        autoIndexTriggered = false;
      }
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function fetchMemories() {
    memoriesLoading = true;
    console.log('[debug] Fetching memories...');
    try {
      const res = await fetch(api('/api/memories'));
      memories = await res.json();
      console.log('[debug] Fetched memories:', memories.length, 'total');
    } finally {
      memoriesLoading = false;
    }
  }

  async function runSearch() {
    if (!searchQuery) return;
    searchLoading = true;
    try {
      const res = await fetch(api(`/api/search?q=${encodeURIComponent(searchQuery)}`));
      searchResults = await res.json();
    } finally {
      searchLoading = false;
    }
  }

  async function deleteMemory(id: number) {
    if (!confirm('Delete this memory?')) return;
    try {
      const res = await fetch(api(`/api/memories/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      console.log(`[debug] Deleted id=${data.id}, starting undo timer`);
      fetchMemories();
      fetchStatus();
      
      toast = { visible: true, id: data.id };
      setTimeout(() => {
        if (toast.id === data.id) toast.visible = false;
      }, 8000);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function undoDelete() {
    if (!toast.id) return;
    try {
      const res = await fetch(api(`/api/memories/${toast.id}/restore`), { method: 'POST' });
      if (!res.ok) throw new Error(res.statusText);
      toast.visible = false;
      fetchMemories();
      fetchStatus();
    } catch (e: unknown) {
      alert('Failed to restore: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  $effect(() => {
    fetchStatus();
  });

  $effect(() => {
    // When project changes, refresh current tab
    if (selectedProjectId !== undefined) {
      fetchStatus();
      if (tab === 'memories') {
        fetchMemories();
        fetchDuplicates();
      } else if (tab === 'search') {
        searchResults = [];
      } else if (tab === 'settings') {
        fetchConfig();
      }
    }
  });

  $effect(() => {
    if (tab === 'memories') {
      fetchMemories();
      fetchDuplicates();
    } else if (tab === 'search') {
      searchResults = [];
    } else if (tab === 'settings') {
      fetchConfig();
    }
  });
</script>

<app-shell>
  <app-header>
    <logo>Semanthicc</logo>
    
    <project-selector>
      <select bind:value={selectedProjectId} onchange={switchProject}>
        <option value={null}>Global</option>
        {#each projects as p}
          <option value={p.id}>{p.name} ({p.chunk_count} chunks)</option>
        {/each}
      </select>
    </project-selector>

    <nav-bar>
      <tab-btn class:active={tab === 'overview'} onclick={() => tab = 'overview'} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (tab = 'overview')}>Overview</tab-btn>
      <tab-btn class:active={tab === 'memories'} onclick={() => tab = 'memories'} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (tab = 'memories')}>Memories</tab-btn>
      <tab-btn class:active={tab === 'search'} onclick={() => tab = 'search'} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (tab = 'search')}>Search</tab-btn>
      <tab-btn class:active={tab === 'settings'} onclick={() => tab = 'settings'} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (tab = 'settings')}>Settings</tab-btn>
    </nav-bar>
  </app-header>

  {#if loading}
    <status-message>Loading...</status-message>
  {:else if error}
    <status-message type="error">Error: {error}</status-message>
  {:else if status}
    {#if tab === 'overview'}
      <info-card>
        <card-title>Project: {status.projectName || 'Global'}</card-title>
        <card-path>{status.projectPath || 'No project context'}</card-path>
        
        <stats-row>
          <stat-box>
            <stat-value>{status.memories.total}</stat-value>
            <stat-label>Memories</stat-label>
          </stat-box>
          <stat-box>
            <stat-value>{status.index?.chunkCount || 0}</stat-value>
            <stat-label>Chunks</stat-label>
          </stat-box>
          <stat-box>
            <stat-value>{status.memories.avgConfidence.toFixed(2)}</stat-value>
            <stat-label>Avg Conf</stat-label>
          </stat-box>
        </stats-row>

        <card-title>Breakdown</card-title>
        <type-list>
          {#each status.typeBreakdown as type}
            <type-item>{type.concept_type}: {type.count}</type-item>
          {/each}
        </type-list>

        <card-title>Index Management</card-title>
        
        {#if embeddingWarning}
          <embedding-warning>
            <warning-icon>⚠️</warning-icon>
            <warning-text>
              <strong>Embedding Config Mismatch</strong><br>
              Index: {embeddingWarning.storedProvider} ({embeddingWarning.storedDimensions} dims)<br>
              Current: {embeddingWarning.currentProvider} ({embeddingWarning.currentDimensions} dims)<br>
              <em>Search will fail. Force reindex required.</em>
            </warning-text>
          </embedding-warning>
        {/if}
        
        <index-status>
          <status-header>
            <status-label>Index: {status.coverage?.coveragePercent || 0}%</status-label>
            {#if status.coverage && status.coverage.staleFiles > 0}
              <warning-badge>{status.coverage.staleFiles} files changed</warning-badge>
            {/if}
          </status-header>
          <progress-container class="coverage">
            <progress-bar style="--percent: {status.coverage?.coveragePercent || 0}%"></progress-bar>
          </progress-container>
        </index-status>

        <index-actions>
          {#if indexing}
            <action-btn 
              class="stop" 
              onclick={stopIndex} 
              role="button" 
              tabindex="0" 
              onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && stopIndex()}
            >
              Stop Indexing
            </action-btn>
          {:else}
            <action-btn 
              class="primary" 
              onclick={indexProject} 
              disabled={deletingIndex || (status.coverage?.coveragePercent === 100)}
              role="button" 
              tabindex="0"
              onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && indexProject()}
            >
              {indexing ? 'Scanning...' : 'Sync Changes'}
            </action-btn>

            {#if embeddingWarning || (status.coverage && status.coverage.coveragePercent < 100)}
            <action-btn 
              class="force" 
              onclick={async () => { await deleteIndex(); await indexProject(); }}
              disabled={deletingIndex}
              role="button" 
              tabindex="0"
              onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (async () => { await deleteIndex(); await indexProject(); })()}
            >
              Force Reindex
            </action-btn>
            {/if}

            <action-btn 
              class="delete-index" 
              onclick={deleteIndex} 
              disabled={deletingIndex}
              role="button" 
              tabindex="0"
              onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && deleteIndex()}
            >
              {deletingIndex ? 'Deleting...' : 'Delete Index'}
            </action-btn>
          {/if}
        </index-actions>
        
        {#if indexMsg}
          <status-message type={indexMsgType}>{indexMsg}</status-message>
        {/if}
        
        {#if indexErrors.length > 0}
          <error-details>
            <button class="toggle-errors" onclick={() => showErrors = !showErrors}>
              {showErrors ? '▼' : '▶'} {indexErrors.length} file(s) failed
            </button>
            {#if showErrors}
              <error-list>
                {#each indexErrors.slice(0, 10) as err}
                  <error-item>
                    <span class="file">{err.file}</span>
                    <span class="msg">{err.error}</span>
                  </error-item>
                {/each}
                {#if indexErrors.length > 10}
                  <error-item class="more">...and {indexErrors.length - 10} more</error-item>
                {/if}
              </error-list>
            {/if}
          </error-details>
        {/if}

        {#if indexing}
          <progress-container>
            <progress-bar style="width: {indexProgress}%"></progress-bar>
          </progress-container>
          <status-text>{indexStatusText}</status-text>
        {/if}
      </info-card>
    {:else if tab === 'memories'}
      <info-card>
        <mem-header>
          <card-title>Memories</card-title>
          <filter-group>
            <filter-btn class:active={filter === 'all'} onclick={() => filter = 'all'} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (filter = 'all')}>All</filter-btn>
            <filter-btn class:active={filter === 'project'} onclick={() => filter = 'project'} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (filter = 'project')}>Project Only</filter-btn>
            <filter-btn class:active={filter === 'global'} onclick={() => filter = 'global'} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (filter = 'global')}>Global Only</filter-btn>
          </filter-group>
          {#if duplicatesCount > 0}
            <action-btn class="purge" onclick={purgeDuplicates} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && purgeDuplicates()}>
              Purge Duplicates ({duplicatesCount})
            </action-btn>
          {/if}
        </mem-header>
        {#if memoriesLoading}
          <status-message>Loading memories...</status-message>
        {:else}
          <mem-list>
            {#each filteredMemories as m}
              <mem-item>
                <mem-id>#{m.id}</mem-id>
                <tag-badge class="scope">{m.project_id ? 'Project' : 'Global'}</tag-badge>
                <tag-badge class="type">{m.concept_type}</tag-badge>
                {#if m.domain}<tag-badge class="domain">{m.domain}</tag-badge>{/if}
                <mem-content title={m.content}>{m.content}</mem-content>
                <mem-conf>{m.confidence.toFixed(2)}</mem-conf>
                <mem-actions>
                  <action-btn class="edit" onclick={() => startEdit(m)} aria-label="Edit" role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && startEdit(m)}>✏️</action-btn>
                  <action-btn class="delete" onclick={() => deleteMemory(m.id)} aria-label="Delete" role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && deleteMemory(m.id)}>×</action-btn>
                </mem-actions>
              </mem-item>
            {/each}
          </mem-list>
        {/if}
      </info-card>

      {#if editingMemory}
        <modal-layer 
          onclick={() => editingMemory = null}
          onkeydown={(e: any) => e.key === 'Escape' && (editingMemory = null)}
          role="presentation"
          tabindex="-1"
        >
          <modal-panel onclick={(e: any) => e.stopPropagation()} onkeydown={(e: any) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <card-title>Edit Memory #{editingMemory.id}</card-title>
            
            <form-field>
              <field-label>Content</field-label>
              <textarea bind:value={editingMemory.content} rows="3"></textarea>
            </form-field>

            <form-row>
            <form-field>
              <field-label>Type</field-label>
              <select bind:value={editingMemory.concept_type}>
                <option value="pattern">Pattern</option>
                <option value="rule">Rule</option>
                <option value="constraint">Constraint</option>
                <option value="decision">Decision</option>
                <option value="context">Context</option>
                <option value="learning">Learning</option>
              </select>
            </form-field>

            <form-field>
              <field-label>Domain</field-label>
              <input type="text" bind:value={editingMemory.domain} />
            </form-field>

            <form-field>
              <field-label>Confidence</field-label>
              <input type="number" step="0.01" min="0" max="1" bind:value={editingMemory.confidence} />
            </form-field>
            </form-row>

            <modal-actions>
              <action-btn onclick={() => editingMemory = null} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && (editingMemory = null)}>Cancel</action-btn>
              <action-btn class="primary" onclick={saveEdit} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && saveEdit()}>Save</action-btn>
            </modal-actions>
          </modal-panel>
        </modal-layer>
      {/if}
    {:else if tab === 'search'}
      <info-card>
        <card-title>Semantic Search</card-title>
        <search-box>
          <input 
            type="text" 
            bind:value={searchQuery} 
            placeholder="Search code..." 
            onkeydown={(e: any) => e.key === 'Enter' && runSearch()}
          />
          <action-btn onclick={runSearch} disabled={searchLoading} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && runSearch()}>Search</action-btn>
        </search-box>

        {#if searchLoading}
          <status-message>Searching...</status-message>
        {:else if searchResults.length > 0}
          <result-list>
            {#each searchResults as r}
              <result-item>
                <result-header>
                  <result-file>{r.filePath}</result-file>
                  <result-lines>L{r.chunkStart}-{r.chunkEnd}</result-lines>
                </result-header>
                <result-code>{r.content}</result-code>
              </result-item>
            {/each}
          </result-list>
        {/if}
      </info-card>
    {:else if tab === 'settings'}
      <info-card>
        <card-title>Embedding Configuration</card-title>
        
        <form-field>
          <field-label>Provider</field-label>
          <select bind:value={embeddingConfig.provider}>
            <option value="local">Local (MiniLM-L6-v2)</option>
            <option value="gemini">Gemini API</option>
          </select>
        </form-field>

        {#if embeddingConfig.provider === 'gemini'}
          <form-field>
            <field-label>API Key {embeddingConfig.hasApiKey ? '(Saved)' : ''}</field-label>
            <input 
              type="password" 
              bind:value={geminiApiKey} 
              placeholder={embeddingConfig.hasApiKey ? 'Enter new key to update...' : 'Enter Gemini API key...'}
            />
          </form-field>

          <form-row>
            <form-field>
              <field-label>Model</field-label>
              <select bind:value={embeddingConfig.geminiModel}>
                <option value="gemini-embedding-001">gemini-embedding-001</option>
                <option value="text-embedding-004">text-embedding-004</option>
              </select>
            </form-field>

            <form-field>
              <field-label>Dimensions (Optional)</field-label>
              <input 
                type="number" 
                bind:value={embeddingConfig.dimensions} 
                min="256" 
                max="3072" 
                placeholder="e.g. 768" 
              />
            </form-field>
          </form-row>
        {/if}

        <modal-actions>
          <action-btn 
            class="primary" 
            onclick={saveConfig} 
            disabled={configSaving}
            role="button" 
            tabindex="0" 
            onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && saveConfig()}
          >
            {configSaving ? 'Saving...' : 'Save Settings'}
          </action-btn>
        </modal-actions>

        {#if configMsg}
          <status-message type={configMsgType}>{configMsg}</status-message>
        {/if}
      </info-card>
    {/if}
  {/if}

  {#if toast.visible}
    <toast-notification>
      <span>Memory deleted.</span>
      <action-btn class="undo" onclick={undoDelete} role="button" tabindex="0" onkeydown={(e: any) => (e.key === 'Enter' || e.key === ' ') && undoDelete()}>Undo</action-btn>
    </toast-notification>
  {/if}
</app-shell>

<style>
  app-shell {
    font-family: system-ui, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    display: block;
  }

  app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  logo {
    font-size: 1.5rem;
    font-weight: bold;
    display: block;
    margin-right: 1rem;
  }

  project-selector {
    flex: 1;
    display: flex;
    align-items: center;
    max-width: 300px;
  }

  project-selector select {
    width: 100%;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid #ccc;
    font-size: 0.9rem;
    background: white;
  }

  nav-bar {
    display: flex;
    gap: 1rem;
  }

  tab-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    display: inline-block;
  }

  tab-btn.active {
    background: #eee;
    font-weight: bold;
  }

  info-card {
    border: 1px solid #ccc;
    padding: 1rem;
    border-radius: 8px;
    display: block;
  }

  card-title {
    font-size: 1.25rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
    display: block;
  }

  card-path {
    color: #666;
    margin-bottom: 1rem;
    display: block;
  }

  stats-row {
    display: flex;
    gap: 2rem;
    margin: 1rem 0;
  }

  stat-box {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  stat-value {
    font-size: 2rem;
    font-weight: bold;
    display: block;
  }

  stat-label {
    color: #666;
    font-size: 0.9rem;
    display: block;
  }

  type-list {
    list-style: none;
    padding: 0;
    display: block;
  }

  type-item {
    padding: 0.25rem 0;
    display: block;
  }

  index-status {
    display: block;
    margin-bottom: 1rem;
  }

  status-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  status-label {
    font-weight: bold;
    font-size: 0.9rem;
  }

  warning-badge {
    background: #fff3e0;
    color: #e65100;
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    border: 1px solid #ffe0b2;
    font-weight: bold;
  }

  embedding-warning {
    display: flex;
    background: #ffebee;
    border: 1px solid #ef9a9a;
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    gap: 0.5rem;
    align-items: flex-start;
  }

  embedding-warning warning-icon {
    font-size: 1.2rem;
  }

  embedding-warning warning-text {
    font-size: 0.85rem;
    color: #c62828;
    line-height: 1.4;
  }

  embedding-warning strong {
    color: #b71c1c;
  }

  action-btn.force {
    background: #ff9800;
    color: white;
  }

  action-btn.force:hover:not(:disabled) {
    background: #f57c00;
  }

  progress-container.coverage {
    margin-top: 0;
    background: #e0e0e0;
  }

  progress-container.coverage progress-bar {
    width: var(--percent);
    background: linear-gradient(90deg, #4caf50, #8bc34a);
  }

  index-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  action-btn.delete-index {
    color: #c62828;
    border: 1px solid #c62828;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    background: white;
  }
  
  action-btn.delete-index:hover:not([disabled]) {
    background: #ffebee;
  }

  action-btn.stop {
    background: #f44336;
    color: white;
  }
  
  action-btn.stop:hover:not(:disabled) {
    background: #d32f2f;
  }

  action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  status-message {
    text-align: center;
    padding: 1rem;
    display: block;
  }

  status-message[type="error"] {
    color: red;
  }

  status-message[type="success"] {
    color: #2e7d32;
  }

  mem-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  filter-group {
    display: flex;
    gap: 0.5rem;
    background: #f5f5f5;
    padding: 0.25rem;
    border-radius: 6px;
  }

  filter-btn {
    background: none;
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    color: #666;
    display: inline-block;
  }

  filter-btn.active {
    background: white;
    color: #000;
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  mem-list {
    list-style: none;
    padding: 0;
    display: block;
  }

  mem-item {
    border-bottom: 1px solid #eee;
    padding: 0.5rem 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  mem-id {
    color: #999;
    font-size: 0.8rem;
    min-width: 30px;
    display: block;
  }

  mem-content {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 600px;
    display: block;
  }

  mem-conf {
    color: #666;
    font-size: 0.8rem;
    display: block;
  }

  mem-actions {
    display: flex;
    gap: 0.25rem;
  }

  tag-badge {
    background: #eee;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    white-space: nowrap;
    display: inline-block;
  }

  tag-badge.scope {
    background: #e3f2fd;
    color: #0d47a1;
  }

  action-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.5rem;
    display: inline-block;
  }

  action-btn.purge {
    background: #ffebee;
    color: #c62828;
    border: 1px solid #ef9a9a;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  action-btn.purge:hover {
    background: #ffcdd2;
  }

  action-btn.edit {
    font-size: 1.2rem;
    padding: 0 0.25rem;
    line-height: 1;
    opacity: 0.6;
  }

  action-btn.edit:hover {
    opacity: 1;
  }

  action-btn.delete {
    color: #ccc;
    font-size: 1.5rem;
    line-height: 1;
  }

  action-btn.delete:hover {
    color: red;
  }

  action-btn.primary {
    background: #0d47a1;
    color: white;
    border: 1px solid #0d47a1;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  modal-layer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
  }

  modal-panel {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    width: 500px;
    max-width: 90%;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  modal-panel card-title {
    margin-top: 0;
  }

  form-field {
    display: block;
    margin-bottom: 1rem;
  }

  field-label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: bold;
    font-size: 0.9rem;
  }



  form-row {
    display: flex;
    gap: 1rem;
  }

  form-row form-field {
    flex: 1;
  }

  modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  modal-actions action-btn {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: 1px solid #ccc;
    background: white;
  }

  search-box {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }



  result-list {
    list-style: none;
    padding: 0;
    display: block;
  }

  result-item {
    margin-bottom: 1rem;
    border: 1px solid #eee;
    padding: 0.5rem;
    border-radius: 4px;
  }

  result-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 0.5rem;
  }

  result-file, result-lines {
    display: block;
  }

  result-code {
    background: #f5f5f5;
    padding: 0.5rem;
    overflow-x: auto;
    margin: 0;
    display: block;
    white-space: pre-wrap;
    font-family: monospace;
  }

  toast-notification {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 200;
    animation: slideUp 0.3s ease-out;
  }

  action-btn.undo {
    color: #4fc3f7;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 0.9rem;
    padding: 0;
  }

  action-btn.undo:hover {
    text-decoration: underline;
  }

  @keyframes slideUp {
    from { transform: translate(-50%, 100%); opacity: 0; }
    to { transform: translate(-50%, 0); opacity: 1; }
  }

  progress-container {
    display: block;
    width: 100%;
    height: 8px;
    background: #eee;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 1rem;
  }

  progress-bar {
    display: block;
    height: 100%;
    background: #0d47a1;
    transition: width 0.2s ease;
  }

  status-text {
    display: block;
    font-size: 0.9rem;
    color: #666;
    margin-top: 0.5rem;
    text-align: center;
  }

  error-details {
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }

  .toggle-errors {
    background: none;
    border: none;
    color: #f57c00;
    cursor: pointer;
    padding: 0.25rem 0;
    font-size: 0.85rem;
  }

  .toggle-errors:hover {
    text-decoration: underline;
  }

  error-list {
    display: block;
    margin-top: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    background: #fff3e0;
    border-radius: 4px;
    padding: 0.5rem;
  }

  error-item {
    display: block;
    padding: 0.25rem 0;
    border-bottom: 1px solid #ffe0b2;
  }

  error-item:last-child {
    border-bottom: none;
  }

  error-item .file {
    font-weight: 500;
    color: #e65100;
  }

  error-item .msg {
    display: block;
    color: #666;
    font-size: 0.8rem;
    margin-top: 0.1rem;
  }

  error-item.more {
    color: #999;
    font-style: italic;
  }
</style>
