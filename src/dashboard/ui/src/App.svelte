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
      fetchMemories();
      fetchStatus();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  $effect(() => {
    fetchStatus();
  });

  $effect(() => {
    if (tab === 'memories') fetchMemories();
  });
</script>

<main>
  <header>
    <h1>Semanthicc</h1>
    <nav>
      <button class:active={tab === 'overview'} onclick={() => tab = 'overview'}>Overview</button>
      <button class:active={tab === 'memories'} onclick={() => tab = 'memories'}>Memories</button>
      <button class:active={tab === 'search'} onclick={() => tab = 'search'}>Search</button>
    </nav>
  </header>

  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <p class="error">Error: {error}</p>
  {:else if status}
    {#if tab === 'overview'}
      <div class="card">
        <h2>Project: {status.projectName || 'Global'}</h2>
        <p class="path">{status.projectPath || 'No project context'}</p>
        
        <div class="stats">
          <div class="stat">
            <span class="value">{status.memories.total}</span>
            <span class="label">Memories</span>
          </div>
          <div class="stat">
            <span class="value">{status.index?.chunkCount || 0}</span>
            <span class="label">Chunks</span>
          </div>
          <div class="stat">
            <span class="value">{status.memories.avgConfidence.toFixed(2)}</span>
            <span class="label">Avg Conf</span>
          </div>
        </div>

        <h3>Breakdown</h3>
        <ul>
          {#each status.typeBreakdown as type}
            <li>{type.concept_type}: {type.count}</li>
          {/each}
        </ul>
      </div>
    {:else if tab === 'memories'}
      <div class="card">
        <h2>Memories</h2>
        {#if memoriesLoading}
          <p>Loading memories...</p>
        {:else}
          <ul class="memory-list">
            {#each memories as m}
              <li class="memory-item">
                <span class="id">#{m.id}</span>
                <span class="scope tag">{m.project_id ? 'Project' : 'Global'}</span>
                <span class="type tag">{m.concept_type}</span>
                {#if m.domain}<span class="domain tag">{m.domain}</span>{/if}
                <span class="content" title={m.content}>{m.content}</span>
                <span class="conf">{m.confidence.toFixed(2)}</span>
                <button class="delete-btn" onclick={() => deleteMemory(m.id)} aria-label="Delete">×</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else if tab === 'search'}
      <div class="card">
        <h2>Semantic Search</h2>
        <div class="search-box">
          <input 
            type="text" 
            bind:value={searchQuery} 
            placeholder="Search code..." 
            onkeydown={(e) => e.key === 'Enter' && runSearch()}
          />
          <button onclick={runSearch} disabled={searchLoading}>Search</button>
        </div>

        {#if searchLoading}
          <p>Searching...</p>
        {:else if searchResults.length > 0}
          <ul class="results-list">
            {#each searchResults as r}
              <li class="result-item">
                <div class="result-header">
                  <span class="file">{r.filePath}</span>
                  <span class="lines">L{r.chunkStart}-{r.chunkEnd}</span>
                </div>
                <pre>{r.content}</pre>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {/if}
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }
  nav {
    display: flex;
    gap: 1rem;
  }
  nav button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }
  nav button.active {
    background: #eee;
    font-weight: bold;
  }
  .card {
    border: 1px solid #ccc;
    padding: 1rem;
    border-radius: 8px;
  }
  .stats {
    display: flex;
    gap: 2rem;
    margin: 1rem 0;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .value {
    font-size: 2rem;
    font-weight: bold;
  }
  .error {
    color: red;
  }
  .memory-list, .results-list {
    list-style: none;
    padding: 0;
  }
  .memory-item {
    border-bottom: 1px solid #eee;
    padding: 0.5rem 0;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .tag {
    background: #eee;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .scope {
    background: #e3f2fd;
    color: #0d47a1;
  }
  .id {
    color: #999;
    font-size: 0.8rem;
    min-width: 30px;
  }
  .content {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 600px;
  }
  .conf {
    color: #666;
    font-size: 0.8rem;
  }
  .delete-btn {
    background: none;
    border: none;
    color: #ccc;
    cursor: pointer;
    font-size: 1.5rem;
    padding: 0 0.5rem;
    line-height: 1;
  }
  .delete-btn:hover {
    color: red;
  }
  .search-box {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  input {
    flex: 1;
    padding: 0.5rem;
  }
  .result-item {
    margin-bottom: 1rem;
    border: 1px solid #eee;
    padding: 0.5rem;
    border-radius: 4px;
  }
  .result-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    color: #666;
    margin-bottom: 0.5rem;
  }
  pre {
    background: #f5f5f5;
    padding: 0.5rem;
    overflow-x: auto;
    margin: 0;
  }
</style>