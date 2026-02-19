<script lang="ts">
	import { workspaceStatus } from '$lib/stores/workspaceStatus.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Servitor</title></svelte:head>

<div>
	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-lg font-semibold text-zinc-300">Workspaces</h3>
		<a
			href="/workspaces/new"
			class="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
		>
			+ New Workspace
		</a>
	</div>

	{#if data.workspaces.length === 0}
		<p class="text-zinc-600">No workspaces yet. Create one to get started.</p>
	{:else}
		<div class="space-y-2">
			{#each data.workspaces as ws}
				<a
					href="/workspaces/{ws.name}"
					class="block rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
				>
					<div class="flex items-center gap-2 font-medium">
						<span
							class="inline-block h-1.5 w-1.5 shrink-0 rounded-full {workspaceStatus.isBusy(ws.name)
								? 'bg-pink-500 animate-pulse'
								: 'bg-zinc-700'}"
						></span>
						{ws.name}
					</div>
					<div class="mt-1 text-sm text-zinc-500">
						<span class="font-mono">{ws.branch}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
