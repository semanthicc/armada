<script lang="ts">
  import type { Project } from '../../types';
  import { updateProjectAutoIndex } from '../api';

  interface Props {
    projects: Project[];
    selectedProjectId: number | null;
    onProjectChange: (projectId: number | null) => void;
    onProjectsUpdate: (projects: Project[]) => void;
  }

  let { projects, selectedProjectId, onProjectChange, onProjectsUpdate }: Props = $props();

  function handleChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    const newId = value ? Number(value) : null;
    onProjectChange(newId);
  }

  async function toggleAutoIndex() {
    if (!selectedProjectId) return;
    const currentProject = projects.find(p => p.id === selectedProjectId);
    if (!currentProject) return;

    const newValue = !currentProject.auto_index;
    await updateProjectAutoIndex(selectedProjectId, newValue);

    currentProject.auto_index = newValue;
    onProjectsUpdate([...projects]);
  }

  let currentProject = $derived(projects.find(p => p.id === selectedProjectId));
</script>

<project-selector>
  <select value={selectedProjectId} onchange={handleChange}>
    <option value="">Global</option>
    {#each projects as p}
      <option value={p.id}>{p.name} ({p.chunk_count} chunks)</option>
    {/each}
  </select>
  {#if selectedProjectId}
    <label class="auto-index-toggle">
      <input type="checkbox" checked={currentProject?.auto_index} onchange={toggleAutoIndex} />
      Auto-index
    </label>
  {/if}
</project-selector>

<style>
  project-selector {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  select {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    border: 1px solid #333;
    background: #1a1a1a;
    color: #fff;
    font-size: 0.875rem;
    cursor: pointer;
  }

  select:hover {
    border-color: #555;
  }

  .auto-index-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #888;
    cursor: pointer;
  }

  .auto-index-toggle input {
    cursor: pointer;
  }
</style>
