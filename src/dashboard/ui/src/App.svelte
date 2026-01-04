<script>
  let status = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let tab = $state('overview');
  
  let searchQuery = $state('');
  let searchResults = $state([]);
  let searchLoading = $state(false);

  let memories = $state([]);
  let memoriesLoading = $state(false);

  let editingMemory = $state(null);
  let duplicatesCount = $state(0);
  
  let indexing = $state(false);
  let deletingIndex = $state(false);
  let indexMsg = $state(null);
  let indexMsgType = $state('success');
  let indexProgress = $state(0);
  let indexStatusText = $state('');

  let toast = $state({ visible: false, id: null });
  let filter = $state('all');
  let filteredMemories = $derived(memories.filter(m => {
    if (filter === 'project') return m.project_id !== null;
    if (filter === 'global') return m.project_id === null;
    return true;
  }));

  async function fetchDuplicates() {
    try {
      console.log('[debug] Fetching duplicates...');
      const res = await fetch('/api/duplicates');
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
      const res = await fetch('/api/duplicates', { method: 'DELETE' });
      const data = await res.json();
      alert(`Deleted ${data.deleted} duplicates.`);
      fetchMemories();
      fetchDuplicates();
    } catch (e) {
      alert('Failed to purge: ' + e.message);
    }
  }

  async function deleteIndex() {
    if (!confirm('Are you sure you want to delete the semantic index? This cannot be undone.')) return;
    
    deletingIndex = true;
    indexMsg = null;
    console.log('[debug] Deleting index...');
    
    try {
      const res = await fetch('/api/index', { method: 'DELETE' });
      const data = await res.json();
      
      if (!res.ok) throw new Error(res.statusText);
      
      indexMsg = 'Index deleted successfully.';
      indexMsgType = 'success';
      fetchStatus();
    } catch (e) {
      console.error(e);
      indexMsg = 'Failed to delete index: ' + (e instanceof Error ? e.message : String(e));
      indexMsgType = 'error';
    } finally {
      deletingIndex = false;
    }
  }

  async function indexProject() {
    indexing = true;
    indexMsg = null;
    indexProgress = 0;
    indexStatusText = 'Starting index...';
    console.log('[debug] Starting index...');
    
    try {
      const res = await fetch('/api/index', { method: 'POST' });
      
      if (!res.ok) throw new Error(res.statusText);
      
      const reader = res.body.getReader();
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
                indexStatusText = `Indexing: ${data.processedFiles}/${data.totalFiles} files (${data.totalChunks} chunks)`;
              } else if (data.type === 'complete') {
                const result = data.result;
                indexMsg = `Indexed ${result.filesIndexed} files (${result.chunksCreated} chunks) in ${(result.durationMs/1000).toFixed(1)}s`;
                indexMsgType = 'success';
                indexProgress = 100;
                indexStatusText = 'Complete!';
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
    } catch (e) {
      console.error(e);
      indexMsg = 'Indexing failed: ' + (e instanceof Error ? e.message : String(e));
      indexMsgType = 'error';
      indexStatusText = 'Failed';
    } finally {
      indexing = false;
    }
  }

  function startEdit(m) {
    editingMemory = { ...m };
  }

  async function saveEdit() {
    if (!editingMemory) return;
    console.log('[debug] Saving memory...', editingMemory.id);
    try {
      const res = await fetch(`/api/memories/${editingMemory.id}`, {
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
    } catch (e) {
      alert('Failed to save: ' + e.message);
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error(res.statusText);
      status = await res.json();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function fetchMemories() {
    memoriesLoading = true;
    try {
      const res = await fetch('/api/memories');
      memories = await res.json();
    } finally {
      memoriesLoading = false;
    }
  }

  async function runSearch() {
    if (!searchQuery) return;
    searchLoading = true;
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      searchResults = await res.json();
    } finally {
      searchLoading = false;
    }
  }

  async function deleteMemory(id) {
    if (!confirm('Delete this memory?')) return;
    try {
      const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      console.log(`[debug] Deleted id=${data.id}, starting undo timer`);
      fetchMemories();
      fetchStatus();
      
      toast = { visible: true, id: data.id };
      setTimeout(() => {
        if (toast.id === data.id) toast.visible = false;
      }, 8000);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function undoDelete() {
    if (!toast.id) return;
    try {
      const res = await fetch(`/api/memories/${toast.id}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error(res.statusText);
      toast.visible = false;
      fetchMemories();
      fetchStatus();
    } catch (e) {
      alert('Failed to restore: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  $effect(() => {
    fetchStatus();
  });

  $effect(() => {
    if (tab === 'memories') {
      fetchMemories();
      fetchDuplicates();
    } else if (tab === 'search') {
      searchResults = [];
    }
  });
</script>

<app-shell>
  <app-header>
    <logo>Semanthicc</logo>
    <nav-bar>
      <tab-btn class:active={tab === 'overview'} onclick={() => tab = 'overview'} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (tab = 'overview')}>Overview</tab-btn>
      <tab-btn class:active={tab === 'memories'} onclick={() => tab = 'memories'} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (tab = 'memories')}>Memories</tab-btn>
      <tab-btn class:active={tab === 'search'} onclick={() => tab = 'search'} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (tab = 'search')}>Search</tab-btn>
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
        <index-actions>
          <action-btn 
            class="primary" 
            onclick={indexProject} 
            disabled={indexing || deletingIndex}
            role="button" 
            tabindex="0"
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && indexProject()}
          >
            {indexing ? 'Indexing...' : 'Index Project'}
          </action-btn>

          <action-btn 
            class="delete-index" 
            onclick={deleteIndex} 
            disabled={indexing || deletingIndex}
            role="button" 
            tabindex="0"
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && deleteIndex()}
          >
            {deletingIndex ? 'Deleting...' : 'Delete Index'}
          </action-btn>
        </index-actions>
        
        {#if indexMsg}
          <status-message type={indexMsgType}>{indexMsg}</status-message>
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
            <filter-btn class:active={filter === 'all'} onclick={() => filter = 'all'} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (filter = 'all')}>All</filter-btn>
            <filter-btn class:active={filter === 'project'} onclick={() => filter = 'project'} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (filter = 'project')}>Project Only</filter-btn>
            <filter-btn class:active={filter === 'global'} onclick={() => filter = 'global'} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (filter = 'global')}>Global Only</filter-btn>
          </filter-group>
          {#if duplicatesCount > 0}
            <action-btn class="purge" onclick={purgeDuplicates} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && purgeDuplicates()}>
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
                  <action-btn class="edit" onclick={() => startEdit(m)} aria-label="Edit" role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && startEdit(m)}>✏️</action-btn>
                  <action-btn class="delete" onclick={() => deleteMemory(m.id)} aria-label="Delete" role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && deleteMemory(m.id)}>×</action-btn>
                </mem-actions>
              </mem-item>
            {/each}
          </mem-list>
        {/if}
      </info-card>

      {#if editingMemory}
        <modal-layer 
          onclick={() => editingMemory = null}
          onkeydown={(e) => e.key === 'Escape' && (editingMemory = null)}
          role="presentation"
          tabindex="-1"
        >
          <modal-panel onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
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
              <action-btn onclick={() => editingMemory = null} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (editingMemory = null)}>Cancel</action-btn>
              <action-btn class="primary" onclick={saveEdit} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && saveEdit()}>Save</action-btn>
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
            onkeydown={(e) => e.key === 'Enter' && runSearch()}
          />
          <action-btn onclick={runSearch} disabled={searchLoading} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && runSearch()}>Search</action-btn>
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
    {/if}
  {/if}

  {#if toast.visible}
    <toast-notification>
      <span>Memory deleted.</span>
      <action-btn class="undo" onclick={undoDelete} role="button" tabindex="0" onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && undoDelete()}>Undo</action-btn>
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
</style>
