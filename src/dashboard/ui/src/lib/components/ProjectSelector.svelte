<script lang="ts">
  import type { Project } from '../../types';

  interface Props {
    projects: Project[];
    selectedProjectId: number | null;
    onProjectChange: (projectId: number | null) => void;
  }

  let { projects, selectedProjectId, onProjectChange }: Props = $props();

  function handleChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    const newId = value ? Number(value) : null;
    onProjectChange(newId);
  }
</script>

<project-selector>
  <select value={selectedProjectId} onchange={handleChange}>
    <option value="">Global</option>
    {#each projects as p}
      <option value={p.id}>{p.name} ({p.chunk_count} chunks)</option>
    {/each}
  </select>
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
    border: 1px solid #ccc;
    background-color: white;
    color: #333;
    font-size: 0.875rem;
    cursor: pointer;
  }

  option {
    background-color: white;
    color: #333;
  }

  select:hover {
    border-color: #999;
  }
</style>
