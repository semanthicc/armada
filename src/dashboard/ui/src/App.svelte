<script lang="ts">
  import type { StatusResponse, Project } from './types';
  import { fetchProjects as apiFetchProjects, fetchStatus as apiFetchStatus } from './lib/api';
  import ProjectSelector from './lib/components/ProjectSelector.svelte';
  import StatusPanel from './lib/components/StatusPanel.svelte';
  import MemoriesTab from './lib/components/MemoriesTab.svelte';
  import SearchTab from './lib/components/SearchTab.svelte';
  import SettingsTab from './lib/components/SettingsTab.svelte';

  let status = $state<StatusResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let projects = $state<Project[]>([]);
  let selectedProjectId = $state<number | null>(null);

  let tab = $state('overview');

  // Init from URL
  const urlParams = new URLSearchParams(window.location.search);
  const pidParam = urlParams.get('project');
  if (pidParam) selectedProjectId = Number(pidParam);

  async function loadProjects() {
    try {
      projects = await apiFetchProjects(selectedProjectId);
    } catch (e) {
      console.error('Failed to fetch projects', e);
    }
  }

  async function loadStatus() {
    try {
      status = await apiFetchStatus(selectedProjectId);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  function handleProjectChange(newProjectId: number | null) {
    selectedProjectId = newProjectId;
    
    // Update URL
    const url = new URL(window.location.href);
    if (selectedProjectId) {
      url.searchParams.set('project', String(selectedProjectId));
    } else {
      url.searchParams.delete('project');
    }
    window.history.pushState({}, '', url);
    
    // Reload status
    loading = true;
    loadStatus();
  }

  function handleProjectsUpdate(updatedProjects: Project[]) {
    projects = updatedProjects;
  }

  function handleAutoIndexChange(newVal: boolean) {
    if (selectedProjectId) {
      const idx = projects.findIndex(p => p.id === selectedProjectId);
      if (idx !== -1) {
        projects[idx] = { ...projects[idx], auto_index: newVal };
      }
    }
  }

  function handleStatusRefresh() {
    loadStatus();
  }

  // Initial load
  $effect(() => {
    loadProjects();
    loadStatus();
  });
  
  let currentProject = $derived(projects.find(p => p.id === selectedProjectId));
  let currentAutoIndex = $derived(currentProject?.auto_index ?? false);
</script>

<app-shell>
  <app-header>
    <logo>Semanthicc</logo>
    
    <ProjectSelector 
      {projects}
      {selectedProjectId}
      onProjectChange={handleProjectChange}
    />

    <nav-bar>
      <button class="tab-btn" class:active={tab === 'overview'} onclick={() => { console.log('tab: overview'); tab = 'overview'; }}>Overview</button>
      <button class="tab-btn" class:active={tab === 'memories'} onclick={() => { console.log('tab: memories'); tab = 'memories'; }}>Memories</button>
      <button class="tab-btn" class:active={tab === 'search'} onclick={() => { console.log('tab: search'); tab = 'search'; }}>Search</button>
      <button class="tab-btn" class:active={tab === 'settings'} onclick={() => { console.log('tab: settings'); tab = 'settings'; }}>Settings</button>
    </nav-bar>
  </app-header>

  {#if loading}
    <status-message>Loading...</status-message>
  {:else if error}
    <status-message type="error">Error: {error}</status-message>
  {:else if status}
    {#if tab === 'overview'}
      <StatusPanel 
        {status}
        projectId={selectedProjectId}
        autoIndex={currentAutoIndex}
        embeddingWarning={status.embeddingWarning}
        onStatusRefresh={handleStatusRefresh}
        onAutoIndexChange={handleAutoIndexChange}
      />
    {:else if tab === 'memories'}
      <MemoriesTab projectId={selectedProjectId} />
    {:else if tab === 'search'}
      <SearchTab projectId={selectedProjectId} />
    {:else if tab === 'settings'}
      <SettingsTab projectId={selectedProjectId} />
    {/if}
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
    gap: 1rem;
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

  button.tab-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  button.tab-btn.active {
    background: #eee;
    font-weight: bold;
  }

  status-message {
    text-align: center;
    padding: 1rem;
    display: block;
  }

  status-message[type="error"] {
    color: red;
  }
</style>
