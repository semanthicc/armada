<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

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
				<a href="/compass" class="hover:underline">🧭 Compass</a>
				<a href="/captain" class="hover:underline text-gray-400">⚓ Captain (coming soon)</a>
			</div>
		</div>
	</nav>
	
	{@render children()}
</div>
