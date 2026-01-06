<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { allPlugins } from '$lib/plugins/registry';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Semanthicc Armada</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<nav class="bg-gray-900 text-white p-4">
		<div class="flex items-center gap-6">
			<a href="/" class="text-xl font-bold">🏴‍☠️ Armada</a>
			<div class="flex gap-4">
				{#each allPlugins as plugin}
					<a href="/{plugin.id}" class="hover:underline">{plugin.icon} {plugin.name}</a>
				{/each}
			</div>
		</div>
	</nav>
	
	{@render children()}
</div>
