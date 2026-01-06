<script lang="ts">
  import { error } from '@sveltejs/kit';
  import { getPluginById } from '$lib/plugins/registry';
  import type { PageData } from './$types';

  let { data } = $props<{ data: PageData }>();
  
  let plugin = $derived(getPluginById(data.pluginId));
  let pluginId = $derived(data.pluginId);
</script>

{#if !plugin}
  <div class="p-8 text-red-500">Plugin "{pluginId}" not found</div>
{:else if pluginId === 'compass'}
  {#await import('$lib/plugins/compass/components/StatusPanel.svelte') then module}
    <module.default />
  {/await}
{:else}
  <div class="p-8">
    <h1 class="text-2xl font-bold">{plugin.icon} {plugin.name}</h1>
    <p class="text-gray-600">Plugin page for {plugin.id}</p>
  </div>
{/if}
