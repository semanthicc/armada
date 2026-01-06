<script lang="ts">
  import type { Memory } from '../../types';
  import { 
    fetchMemories as apiFetchMemories, 
    fetchDuplicates as apiFetchDuplicates,
    purgeDuplicates as apiPurgeDuplicates,
    saveMemory as apiSaveMemory,
    deleteMemory as apiDeleteMemory,
    restoreMemory as apiRestoreMemory
  } from '../api';

  interface Props {
    projectId: number | null;
  }

  let { projectId }: Props = $props();

  let memories = $state<Memory[]>([]);
  let memoriesLoading = $state(true);
  let filter = $state<'all' | 'project' | 'global'>('all');
  let duplicatesCount = $state(0);
  let editingMemory = $state<Memory | null>(null);
  let dialogEl = $state<HTMLDialogElement | null>(null);
  
  let toast = $state({ visible: false, deletedId: 0 });
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Open/close dialog when editingMemory changes
  $effect(() => {
    if (editingMemory && dialogEl) {
      dialogEl.showModal();
    } else if (!editingMemory && dialogEl?.open) {
      dialogEl.close();
    }
  });

  // Handle backdrop click (click on dialog element itself, not content)
  function handleDialogClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      editingMemory = null;
    }
  }

  let filteredMemories = $derived(memories.filter(m => {
    if (filter === 'all') return true;
    if (filter === 'project') return m.project_id !== null;
    if (filter === 'global') return m.project_id === null;
    return true;
  }));

  async function loadMemories() {
    memoriesLoading = true;
    try {
      memories = await apiFetchMemories(projectId);
      duplicatesCount = await apiFetchDuplicates(projectId);
    } catch (e) {
      console.error('Failed to load memories:', e);
    } finally {
      memoriesLoading = false;
    }
  }

  async function handlePurgeDuplicates() {
    try {
      const result = await apiPurgeDuplicates(projectId);
      duplicatesCount = 0;
      await loadMemories();
    } catch (e) {
      console.error('Failed to purge duplicates:', e);
    }
  }

  function startEdit(m: Memory) {
    editingMemory = { ...m };
  }

  async function saveEdit() {
    if (!editingMemory) return;
    
    try {
      await apiSaveMemory(projectId, editingMemory.id, {
        content: editingMemory.content,
        concept_type: editingMemory.concept_type,
        domain: editingMemory.domain ?? null,
        confidence: editingMemory.confidence
      });
      
      const idx = memories.findIndex(m => m.id === editingMemory!.id);
      if (idx !== -1) {
        memories[idx] = { ...editingMemory };
        memories = [...memories];
      }
      editingMemory = null;
    } catch (e) {
      console.error('Failed to save memory:', e);
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiDeleteMemory(projectId, id);
      memories = memories.filter(m => m.id !== id);
      
      toast = { visible: true, deletedId: id };
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => {
        toast = { visible: false, deletedId: 0 };
      }, 5000);
    } catch (e) {
      console.error('Failed to delete memory:', e);
    }
  }

  async function undoDelete() {
    if (!toast.deletedId) return;
    
    try {
      await apiRestoreMemory(projectId, toast.deletedId);
      await loadMemories();
      toast = { visible: false, deletedId: 0 };
      if (toastTimeout) clearTimeout(toastTimeout);
    } catch (e) {
      console.error('Failed to restore memory:', e);
    }
  }

  // Load memories on mount
  $effect(() => {
    loadMemories();
  });
</script>

<info-card>
  <mem-header>
    <card-title>Memories</card-title>
    <filter-group>
      <button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'}>All</button>
      <button class="filter-btn" class:active={filter === 'project'} onclick={() => filter = 'project'}>Project Only</button>
      <button class="filter-btn" class:active={filter === 'global'} onclick={() => filter = 'global'}>Global Only</button>
    </filter-group>
    {#if duplicatesCount > 0}
      <button class="action-btn purge" onclick={handlePurgeDuplicates}>
        Purge Duplicates ({duplicatesCount})
      </button>
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
            <button class="action-btn edit" onclick={() => startEdit(m)} aria-label="Edit">✏️</button>
            <button class="action-btn delete" onclick={() => handleDelete(m.id)} aria-label="Delete">×</button>
          </mem-actions>
        </mem-item>
      {/each}
    </mem-list>
  {/if}
</info-card>

<dialog 
    bind:this={dialogEl}
    class="modal-dialog"
    aria-labelledby="modal-title"
    onclick={handleDialogClick}
  >
    <form class="modal-content" method="dialog">
      <card-title id="modal-title">Edit Memory #{editingMemory?.id}</card-title>
      
      <form-field>
        <field-label>Content</field-label>
        <textarea bind:value={editingMemory!.content} rows="3"></textarea>
      </form-field>

      <form-row>
        <form-field>
          <field-label>Type</field-label>
          <select bind:value={editingMemory!.concept_type}>
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
          <input type="text" bind:value={editingMemory!.domain} />
        </form-field>

        <form-field>
          <field-label>Confidence</field-label>
          <input type="number" step="0.01" min="0" max="1" bind:value={editingMemory!.confidence} />
        </form-field>
      </form-row>

      <modal-actions>
        <button class="action-btn" onclick={() => editingMemory = null}>Cancel</button>
        <button class="action-btn primary" onclick={saveEdit}>Save</button>
      </modal-actions>
    </form>
  </dialog>

{#if toast.visible}
  <toast-notification>
    <span>Memory deleted.</span>
    <button class="action-btn undo" onclick={undoDelete}>Undo</button>
  </toast-notification>
{/if}

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

  button.filter-btn {
    background: none;
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    cursor: pointer;
    color: #666;
  }

  button.filter-btn.active {
    background: white;
    color: #000;
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }

  status-message {
    text-align: center;
    padding: 1rem;
    display: block;
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

  button.action-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.5rem;
  }

  button.action-btn.purge {
    background: #ffebee;
    color: #c62828;
    border: 1px solid #ef9a9a;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  button.action-btn.purge:hover {
    background: #ffcdd2;
  }

  button.action-btn.edit {
    font-size: 1.2rem;
    padding: 0 0.25rem;
    line-height: 1;
    opacity: 0.6;
  }

  button.action-btn.edit:hover {
    opacity: 1;
  }

  button.action-btn.delete {
    color: #ccc;
    font-size: 1.5rem;
    line-height: 1;
  }

  button.action-btn.delete:hover {
    color: red;
  }

  button.action-btn.primary {
    background: #0d47a1;
    color: white;
    border: 1px solid #0d47a1;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  dialog.modal-dialog {
    padding: 0;
    border: none;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 500px;
    width: 90%;
  }

  dialog.modal-dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  .modal-content {
    padding: 2rem;
  }

  .modal-content card-title {
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

  form-field textarea,
  form-field input,
  form-field select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
    box-sizing: border-box;
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

  modal-actions button.action-btn {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: 1px solid #ccc;
    background: white;
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

  button.action-btn.undo {
    color: #4fc3f7;
    font-weight: bold;
    text-transform: uppercase;
    font-size: 0.9rem;
    padding: 0;
  }

  button.action-btn.undo:hover {
    text-decoration: underline;
  }

  @keyframes slideUp {
    from { transform: translate(-50%, 100%); opacity: 0; }
    to { transform: translate(-50%, 0); opacity: 1; }
  }
</style>
