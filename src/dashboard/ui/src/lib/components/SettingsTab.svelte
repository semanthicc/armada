<script lang="ts">
  import type { EmbeddingConfig } from '../../types';
  import { fetchConfig as apiFetchConfig, saveConfig as apiSaveConfig } from '../api';

  interface Props {
    projectId: number | null;
  }

  let { projectId }: Props = $props();

  let config = $state<EmbeddingConfig>({
    provider: 'gemini',
    geminiModel: 'text-embedding-004',
    dimensions: null,
    hasApiKey: false
  });
  let apiKey = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let message = $state<{ text: string; type: 'success' | 'error' } | null>(null);

  async function loadConfig() {
    loading = true;
    try {
      const data = await apiFetchConfig(projectId);
      if (data.embedding) {
        config = data.embedding;
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    } finally {
      loading = false;
    }
  }

  async function handleSave() {
    saving = true;
    message = null;

    try {
      await apiSaveConfig(projectId, {
        provider: config.provider,
        geminiModel: config.geminiModel,
        dimensions: config.dimensions
      }, apiKey || undefined);

      message = { text: 'Settings saved successfully!', type: 'success' };
      apiKey = '';
      await loadConfig();
    } catch (e) {
      console.error('Failed to save config:', e);
      message = { text: 'Failed to save settings', type: 'error' };
    } finally {
      saving = false;
    }
  }

  // Load config on mount
  $effect(() => {
    loadConfig();
  });
</script>

<info-card>
  <card-title>Embedding Settings</card-title>
  
  {#if loading}
    <status-message>Loading settings...</status-message>
  {:else}
    <form-field>
      <field-label>Provider</field-label>
      <select bind:value={config.provider}>
        <option value="gemini">Google Gemini</option>
        <option value="local">Local (Transformers.js)</option>
      </select>
    </form-field>

    {#if config.provider === 'gemini'}
      <form-field>
        <field-label>Model</field-label>
        <select bind:value={config.geminiModel}>
          <option value="text-embedding-004">text-embedding-004</option>
          <option value="embedding-001">embedding-001</option>
        </select>
      </form-field>

      <form-field>
        <field-label>Dimensions (optional)</field-label>
        <input type="number" bind:value={config.dimensions} placeholder="Auto" min="1" max="3072" />
        <field-hint>Leave empty for model default. Lower values = smaller index size.</field-hint>
      </form-field>

      <form-field>
        <field-label>API Key {config.hasApiKey ? '(configured)' : ''}</field-label>
        <input 
          type="password" 
          bind:value={apiKey} 
          placeholder={config.hasApiKey ? '••••••••' : 'Enter API Key'} 
        />
        <field-hint>Leave blank to keep existing key.</field-hint>
      </form-field>
    {/if}

    <form-actions>
      <button class="action-btn primary" onclick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </form-actions>

    {#if message}
      <status-message type={message.type}>{message.text}</status-message>
    {/if}
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
    margin-bottom: 1rem;
    display: block;
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

  form-field select,
  form-field input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem;
    box-sizing: border-box;
  }

  field-hint {
    display: block;
    font-size: 0.8rem;
    color: #666;
    margin-top: 0.25rem;
  }

  form-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
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

  button.action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
