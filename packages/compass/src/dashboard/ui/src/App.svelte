<script lang="ts">
  import { Router, route } from '@mateothegreat/svelte5-router';
  import { appState } from './lib/stores';
  import { loadProjects, loadStatus } from './lib/actions';
  
  import ProjectSelector from './lib/components/ProjectSelector.svelte';
  import StatusPanel from './lib/components/StatusPanel.svelte';
  import MemoriesTab from './lib/components/MemoriesTab.svelte';
  import SearchTab from './lib/components/SearchTab.svelte';
  import SettingsTab from './lib/components/SettingsTab.svelte';

  const routes = [
    { path: '/', component: StatusPanel },
    { path: '/overview', component: StatusPanel },
    { path: '/memories', component: MemoriesTab },
    { path: '/search', component: SearchTab },
    { path: '/settings', component: SettingsTab }
  ];

  // Init from URL (Project ID)
  const urlParams = new URLSearchParams(window.location.search);
  const pidParam = urlParams.get('project');
  if (pidParam) appState.selectedProjectId = Number(pidParam);

  // Lifecycle
  $effect(() => {
    loadProjects();
    loadStatus();
  });
</script>

<app-shell>
  <app-header>
    <div class="header-left">
      <logo>Semanthicc</logo>
      <ProjectSelector />
    </div>

    <nav-bar>
      <a href="#/overview" use:route>Overview</a>
      <a href="#/memories" use:route>Memories</a>
      <a href="#/search" use:route>Search</a>
      <a href="#/settings" use:route>Settings</a>
    </nav-bar>
  </app-header>

  {#if appState.loading}
    <status-message>Loading...</status-message>
  {:else if appState.error}
    <status-message type="error">Error: {appState.error}</status-message>
  {:else if appState.status}
    <div class="main-content">
      <Router {routes} />
    </div>
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

  nav-bar a {
    text-decoration: none;
    color: inherit;
    font-size: 1rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  nav-bar a:hover {
    background: #f5f5f5;
  }

  :global(a.active) {
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
