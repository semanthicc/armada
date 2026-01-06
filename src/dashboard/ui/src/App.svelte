<script lang="ts">
  import type { StatusResponse, Project } from './types';
  import { fetchProjects as apiFetchProjects, fetchStatus as apiFetchStatus } from './lib/api';
  import ProjectSelector from './lib/components/ProjectSelector.svelte';
  import StatusPanel from './lib/components/StatusPanel.svelte';
  import MemoriesTab from './lib/components/MemoriesTab.svelte';
  import SearchTab from './lib/components/SearchTab.svelte';
  import SettingsTab from './lib/components/SettingsTab.svelte';

  // State
  let status = $state<StatusResponse | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let projects = $state<Project[]>([]);
  let selectedProjectId = $state<number | null>(null);
  let tab = $state('overview');

  // Routing Logic (Hash-based)
  function handleHashChange() {
    const hash = window.location.hash.slice(1) || 'overview';
    if (['overview', 'memories', 'search', 'settings'].includes(hash)) {
      tab = hash;
    } else {
      tab = 'overview';
    }
  }

  // Init from URL (Project ID + Tab)
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
    
    const url = new URL(window.location.href);
    if (selectedProjectId) {
      url.searchParams.set('project', String(selectedProjectId));
    } else {
      url.searchParams.delete('project');
    }
    // Preserve hash when changing project
    window.history.pushState({}, '', url.toString());
    
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

  // Lifecycle
  $effect(() => {
    // Initial load
    loadProjects();
    loadStatus();
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  });
  
  let currentProject = $derived(projects.find(p => p.id === selectedProjectId));
  let currentAutoIndex = $derived(currentProject?.auto_index ?? false);
</script>

<app-shell>
  <app-header>
    <div class="header-left">
      <logo>Semanthicc</logo>
      <ProjectSelector 
        {projects}
        {selectedProjectId}
        onProjectChange={handleProjectChange}
      />
    </div>

    <nav-bar>
      <a class="tab-link" class:active={tab === 'overview'} href="#overview">Overview</a>
      <a class="tab-link" class:active={tab === 'memories'} href="#memories">Memories</a>
      <a class="tab-link" class:active={tab === 'search'} href="#search">Search</a>
      <a class="tab-link" class:active={tab === 'settings'} href="#settings">Settings</a>
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
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
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

  a.tab-link {
    text-decoration: none;
    color: inherit;
    font-size: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  a.tab-link:hover {
    background: #f5f5f5;
  }

  a.tab-link.active {
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
