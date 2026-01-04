<script>
  import { onMount } from 'svelte';

  let status = null;
  let loading = true;
  let error = null;

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

  onMount(() => {
    fetchStatus();
  });
</script>

<main>
  <h1>Semanthicc Dashboard</h1>

  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <p class="error">Error: {error}</p>
  {:else if status}
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
  {/if}
</main>

<style>
  main {
    font-family: system-ui, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
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
</style>