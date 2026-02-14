<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import PaneResizer from '$lib/components/PaneResizer.svelte';

	let { data, children } = $props();

	let sidebarWidth = $state(256);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex h-screen bg-zinc-950 text-zinc-100">
	<div class="shrink-0 border-r border-zinc-800" style:width="{sidebarWidth}px">
		<Sidebar projects={data.projects} />
	</div>

	<PaneResizer bind:width={sidebarWidth} min={180} max={480} side="left" storageKey="pane:sidebar" />

	<main class="flex-1 overflow-auto p-6">
		{@render children()}
	</main>
</div>
