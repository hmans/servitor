<script lang="ts">
	let { data } = $props();
</script>

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
					href="/workspaces/{ws.id}"
					class="block rounded-lg border border-zinc-800 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
				>
					<div class="font-medium">{ws.name}</div>
					<div class="mt-1 text-sm text-zinc-500">
						<span class="font-mono">{ws.branch}</span>
						<span
							class="ml-2 rounded-full px-2 py-0.5 text-xs {ws.status === 'active'
								? 'bg-emerald-900/50 text-emerald-400'
								: 'bg-zinc-800 text-zinc-500'}"
						>
							{ws.status}
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
