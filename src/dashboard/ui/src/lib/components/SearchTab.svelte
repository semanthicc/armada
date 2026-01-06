<script lang="ts">
  import { appState } from '../stores';
  import { searchAction } from '../actions';
</script>

<info-card>
  <card-title>Semantic Search</card-title>
  <search-box>
    <input 
      type="text" 
      bind:value={appState.searchQuery} 
      placeholder="Search code..." 
      onkeydown={(e) => e.key === 'Enter' && searchAction()}
    />
    <button class="action-btn" onclick={searchAction} disabled={appState.searchLoading}>Search</button>
  </search-box>

  {#if appState.searchLoading}
    <status-message>Searching...</status-message>
  {:else if appState.searchResults.length > 0}
    <result-list>
      {#each appState.searchResults as r}
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

<style>
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

  search-box {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  search-box input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  button.action-btn {
    background: #0d47a1;
    color: white;
    border: 1px solid #0d47a1;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }

  button.action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  status-message {
    text-align: center;
    padding: 1rem;
    display: block;
    color: #666;
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
</style>
