<script lang="ts">
  import { onMount } from 'svelte';
  import { compassState } from '$lib/plugins/compass/stores.svelte';
  import { loadStatus, loadProjects } from '$lib/plugins/compass/actions';
  
  import StatusPanel from '$lib/plugins/compass/components/StatusPanel.svelte';
  import MemoriesTab from '$lib/plugins/compass/components/MemoriesTab.svelte';
  import SearchTab from '$lib/plugins/compass/components/SearchTab.svelte';
  import SettingsTab from '$lib/plugins/compass/components/SettingsTab.svelte';
  import ProjectSelector from '$lib/plugins/compass/components/ProjectSelector.svelte';

  let activeTab = $state<'status' | 'memories' | 'search' | 'settings'>('status');

  onMount(async () => {
    // Get project ID from URL if present
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project');
    if (projectId) {
      compassState.selectedProjectId = parseInt(projectId, 10);
    }
    
    await loadProjects();
    await loadStatus();
  });
</script>

<div class="compass-dashboard">
  <header class="flex items-center justify-between p-4 border-b">
    <h1 class="text-2xl font-bold">🧭 Compass</h1>
    <ProjectSelector />
  </header>

  <nav class="flex gap-2 p-4 border-b bg-gray-50">
    <button 
      class="px-4 py-2 rounded-lg transition-colors"
      class:bg-blue-600={activeTab === 'status'}
      class:text-white={activeTab === 'status'}
      class:bg-gray-200={activeTab !== 'status'}
      onclick={() => activeTab = 'status'}
    >
      Status
    </button>
    <button 
      class="px-4 py-2 rounded-lg transition-colors"
      class:bg-blue-600={activeTab === 'memories'}
      class:text-white={activeTab === 'memories'}
      class:bg-gray-200={activeTab !== 'memories'}
      onclick={() => activeTab = 'memories'}
    >
      Memories
    </button>
    <button 
      class="px-4 py-2 rounded-lg transition-colors"
      class:bg-blue-600={activeTab === 'search'}
      class:text-white={activeTab === 'search'}
      class:bg-gray-200={activeTab !== 'search'}
      onclick={() => activeTab = 'search'}
    >
      Search
    </button>
    <button 
      class="px-4 py-2 rounded-lg transition-colors"
      class:bg-blue-600={activeTab === 'settings'}
      class:text-white={activeTab === 'settings'}
      class:bg-gray-200={activeTab !== 'settings'}
      onclick={() => activeTab = 'settings'}
    >
      Settings
    </button>
  </nav>

  <main class="p-4">
    {#if compassState.loading}
      <div class="text-center py-8 text-gray-500">Loading...</div>
    {:else if compassState.error}
      <div class="text-center py-8 text-red-500">{compassState.error}</div>
    {:else if compassState.status}
      {#if activeTab === 'status'}
        <StatusPanel />
      {:else if activeTab === 'memories'}
        <MemoriesTab />
      {:else if activeTab === 'search'}
        <SearchTab />
      {:else if activeTab === 'settings'}
        <SettingsTab />
      {/if}
    {/if}
  </main>
</div>
