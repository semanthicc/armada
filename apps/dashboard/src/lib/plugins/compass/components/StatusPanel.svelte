<script lang="ts">
  import type { StatusResponse } from '../types';
  import { compassState, getCurrentProject } from '../stores.svelte';
  import { toggleAutoIndex, loadStatus } from '../actions';
  import { indexProject as apiIndexProject, deleteIndex as apiDeleteIndex, stopIndex as apiStopIndex, type IndexProgressEvent } from '../api';

  let projectId = $derived(compassState.selectedProjectId);
  let status = $derived(compassState.status!);
  let autoIndex = $derived(getCurrentProject()?.auto_index ?? false);
  let embeddingWarning = $derived(compassState.status?.embeddingWarning);

  let indexing = $state(false);
  let deletingIndex = $state(false);
  let indexMsg = $state<string | null>(null);
  let indexMsgType = $state<'success' | 'error' | 'warning' | 'info'>('success');
  let indexProgress = $state(0);
  let indexStatusText = $state('');
  let indexErrors = $state<Array<{file: string; error: string}>>([]);
  let showErrors = $state(false);

  async function handleIndex() {
    indexing = true;
    indexMsg = null;
    indexProgress = 0;
    indexStatusText = 'Starting scan...';

    try {
      await apiIndexProject(projectId, (event: IndexProgressEvent) => {
        if (event.type === 'progress') {
          indexProgress = Math.round((event.processedFiles / event.totalFiles) * 100);
          indexStatusText = `Scanning: ${event.processedFiles}/${event.totalFiles} files (${event.totalChunks} chunks)`;
        } else if (event.type === 'complete') {
          const result = event.result;
          if (result.errorCount && result.errorCount > 0) {
            indexMsg = `Indexed ${result.filesIndexed} files (${result.chunksCreated} chunks) with ${result.errorCount} errors.`;
            indexMsgType = 'warning';
            indexErrors = result.errors || [];
            showErrors = false;
          } else {
            indexMsg = `Indexed ${result.filesIndexed} files (${result.chunksCreated} chunks) in ${(result.durationMs/1000).toFixed(1)}s`;
            indexMsgType = 'success';
            indexErrors = [];
          }
          indexProgress = 100;
          indexStatusText = 'Complete!';
          loadStatus();
        } else if (event.type === 'aborted') {
          indexMsg = 'Indexing aborted by user.';
          indexMsgType = 'info';
          indexStatusText = 'Aborted';
          loadStatus();
        } else if (event.type === 'error') {
          throw new Error(event.error);
        }
      });
    } catch (e: unknown) {
      console.error(e);
      if (indexStatusText !== 'Aborted') {
        indexMsg = 'Indexing failed: ' + (e instanceof Error ? e.message : String(e));
        indexMsgType = 'error';
        indexStatusText = 'Failed';
      }
    } finally {
      indexing = false;
    }
  }

  async function handleStop() {
    try {
      await apiStopIndex(projectId);
      indexStatusText = 'Stopping...';
    } catch (e: unknown) {
      console.error('Failed to stop index', e);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete the semantic index? Search will stop working until you re-index.')) return;
    
    deletingIndex = true;
    indexMsg = null;

    try {
      await apiDeleteIndex(projectId);
      indexMsg = 'Index deleted successfully.';
      indexMsgType = 'success';
      loadStatus();
    } catch (e: unknown) {
      console.error(e);
      indexMsg = 'Failed to delete index: ' + (e instanceof Error ? e.message : String(e));
      indexMsgType = 'error';
    } finally {
      deletingIndex = false;
    }
  }

  async function handleForceReindex() {
    await handleDelete();
    await handleIndex();
  }
</script>

<info-card>
  <card-title>Project: {status.projectName || 'Global'}</card-title>
  <card-path>{status.projectPath || 'No project context'}</card-path>
  
  <stats-row>
    <stat-box>
      <stat-value>{status.memories.total}</stat-value>
      <stat-label>Memories</stat-label>
    </stat-box>
    <stat-box>
      <stat-value>{status.index?.chunkCount || 0}</stat-value>
      <stat-label>Chunks</stat-label>
    </stat-box>
    <stat-box>
      <stat-value>{status.memories.avgConfidence.toFixed(2)}</stat-value>
      <stat-label>Avg Conf</stat-label>
    </stat-box>
  </stats-row>

  <card-title>Breakdown</card-title>
  <type-list>
    {#each status.typeBreakdown as type}
      <type-item>{type.concept_type}: {type.count}</type-item>
    {/each}
  </type-list>

  <card-title>Index Management</card-title>
  
  {#if embeddingWarning}
    <embedding-warning>
      <warning-icon>⚠️</warning-icon>
      <warning-text>
        <strong>Embedding Config Mismatch</strong><br>
        Index: {embeddingWarning.storedProvider} ({embeddingWarning.storedDimensions} dims)<br>
        Current: {embeddingWarning.currentProvider} ({embeddingWarning.currentDimensions} dims)<br>
        <em>Search will fail. Force reindex required.</em>
      </warning-text>
    </embedding-warning>
  {/if}
  
  <index-status>
    <status-header>
      <status-label>Index: {status.coverage?.coveragePercent || 0}%</status-label>
      {#if status.coverage && status.coverage.staleFiles > 0}
        <warning-badge>{status.coverage.staleFiles} files changed</warning-badge>
      {/if}
    </status-header>
    <progress-container class="coverage">
      <progress-bar style="--percent: {status.coverage?.coveragePercent || 0}%"></progress-bar>
    </progress-container>
  </index-status>

  <index-actions>
    {#if indexing}
      <button class="action-btn stop" onclick={handleStop}>Stop Indexing</button>
    {:else}
      <button 
        class="action-btn primary" 
        onclick={handleIndex} 
        disabled={deletingIndex || (status.coverage?.coveragePercent === 100)}
      >
        {indexing ? 'Scanning...' : 'Sync Changes'}
      </button>

      {#if projectId}
        <button 
          class="action-btn auto-index" 
          class:active={autoIndex}
          onclick={toggleAutoIndex}
          title="Automatically sync changes when switching to this project"
        >
          {autoIndex ? '✓ Auto-Index On' : 'Auto-Index Off'}
        </button>
      {/if}

      {#if embeddingWarning || (status.coverage && status.coverage.coveragePercent < 100)}
        <button class="action-btn force" onclick={handleForceReindex} disabled={deletingIndex}>
          Force Reindex
        </button>
      {/if}

      <button class="action-btn delete-index" onclick={handleDelete} disabled={deletingIndex}>
        {deletingIndex ? 'Deleting...' : 'Delete Index'}
      </button>
    {/if}
  </index-actions>
  
  {#if indexMsg}
    <status-message type={indexMsgType}>{indexMsg}</status-message>
  {/if}
  
  {#if indexErrors.length > 0}
    <error-details>
      <button class="toggle-errors" onclick={() => showErrors = !showErrors}>
        {showErrors ? '▼' : '▶'} {indexErrors.length} file(s) failed
      </button>
      {#if showErrors}
        <error-list>
          {#each indexErrors.slice(0, 10) as err}
            <error-item>
              <span class="file">{err.file}</span>
              <span class="msg">{err.error}</span>
            </error-item>
          {/each}
          {#if indexErrors.length > 10}
            <error-item class="more">...and {indexErrors.length - 10} more</error-item>
          {/if}
        </error-list>
      {/if}
    </error-details>
  {/if}

  {#if indexing}
    <progress-container>
      <progress-bar style="width: {indexProgress}%"></progress-bar>
    </progress-container>
    <status-text>{indexStatusText}</status-text>
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

  card-path {
    color: #666;
    margin-bottom: 1rem;
    display: block;
  }

  stats-row {
    display: flex;
    gap: 2rem;
    margin: 1rem 0;
  }

  stat-box {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  stat-value {
    font-size: 2rem;
    font-weight: bold;
    display: block;
  }

  stat-label {
    color: #666;
    font-size: 0.9rem;
    display: block;
  }

  type-list {
    list-style: none;
    padding: 0;
    display: block;
  }

  type-item {
    padding: 0.25rem 0;
    display: block;
  }

  index-status {
    display: block;
    margin-bottom: 1rem;
  }

  status-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  status-label {
    font-weight: bold;
    font-size: 0.9rem;
  }

  warning-badge {
    background: #fff3e0;
    color: #e65100;
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    border: 1px solid #ffe0b2;
    font-weight: bold;
  }

  embedding-warning {
    display: flex;
    background: #ffebee;
    border: 1px solid #ef9a9a;
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    gap: 0.5rem;
    align-items: flex-start;
  }

  embedding-warning warning-icon {
    font-size: 1.2rem;
  }

  embedding-warning warning-text {
    font-size: 0.85rem;
    color: #c62828;
    line-height: 1.4;
  }

  embedding-warning :global(strong) {
    color: #b71c1c;
  }

  index-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  button.action-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.5rem;
  }

  button.action-btn.primary {
    background: #0d47a1;
    color: white;
    border: 1px solid #0d47a1;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  button.action-btn.auto-index {
    border: 1px solid #ccc;
    background: white;
    color: #666;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  button.action-btn.auto-index.active {
    background: #e8f5e9;
    color: #2e7d32;
    border-color: #a5d6a7;
    font-weight: 500;
  }

  button.action-btn.force {
    background: #ff9800;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  button.action-btn.force:hover:not(:disabled) {
    background: #f57c00;
  }

  button.action-btn.delete-index {
    color: #c62828;
    border: 1px solid #c62828;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    background: white;
  }

  button.action-btn.delete-index:hover:not(:disabled) {
    background: #ffebee;
  }

  button.action-btn.stop {
    background: #f44336;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  button.action-btn.stop:hover:not(:disabled) {
    background: #d32f2f;
  }

  button.action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  status-message {
    text-align: center;
    padding: 1rem;
    display: block;
  }

  status-message[type="error"] {
    color: red;
  }

  status-message[type="success"] {
    color: #2e7d32;
  }

  status-message[type="warning"] {
    color: #f57c00;
  }

  status-message[type="info"] {
    color: #1976d2;
  }

  progress-container {
    display: block;
    width: 100%;
    height: 8px;
    background: #eee;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 1rem;
  }

  progress-container.coverage {
    margin-top: 0;
    background: #e0e0e0;
  }

  progress-container.coverage progress-bar {
    width: var(--percent);
    background: linear-gradient(90deg, #4caf50, #8bc34a);
  }

  progress-bar {
    display: block;
    height: 100%;
    background: #0d47a1;
    transition: width 0.2s ease;
  }

  status-text {
    display: block;
    font-size: 0.9rem;
    color: #666;
    margin-top: 0.5rem;
    text-align: center;
  }

  error-details {
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }

  .toggle-errors {
    background: none;
    border: none;
    color: #f57c00;
    cursor: pointer;
    padding: 0.25rem 0;
    font-size: 0.85rem;
  }

  .toggle-errors:hover {
    text-decoration: underline;
  }

  error-list {
    display: block;
    margin-top: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    background: #fff3e0;
    border-radius: 4px;
    padding: 0.5rem;
  }

  error-item {
    display: block;
    padding: 0.25rem 0;
    border-bottom: 1px solid #ffe0b2;
  }

  error-item:last-child {
    border-bottom: none;
  }

  error-item .file {
    font-weight: 500;
    color: #e65100;
  }

  error-item .msg {
    display: block;
    color: #666;
    font-size: 0.8rem;
    margin-top: 0.1rem;
  }

  error-item.more {
    color: #999;
    font-style: italic;
  }
</style>
