<script lang="ts">
	import { page } from '$app/state';
	import { workspaceStatus } from '$lib/stores/workspaceStatus.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';

	type Workspace = {
		name: string;
		branch: string;
	};

	let { workspaces, projectName }: { workspaces: Workspace[]; projectName: string } = $props();

	function isActiveWorkspace(wsName: string) {
		return page.url.pathname.startsWith(`/workspaces/${wsName}`);
	}
</script>

<aside class="flex h-full w-full flex-col bg-zinc-900">
	<div class="border-b border-zinc-800 p-4">
		<a href="/" class="text-lg font-bold tracking-tight hover:text-white">{projectName}</a>
	</div>

	<nav class="flex-1 overflow-auto p-3">
		{#each workspaces as ws}
			<a
				href="/workspaces/{ws.name}"
				class="list-item text-sm font-medium {isActiveWorkspace(ws.name)
					? 'text-zinc-100'
					: 'text-zinc-400 hover:text-zinc-200'}"
			>
				<StatusDot active={workspaceStatus.isBusy(ws.name)} pulse />
				<span class="truncate">{ws.name}</span>
				<span class="shrink-0 font-mono text-xs text-zinc-600">{ws.branch}</span>
			</a>
		{:else}
			<p class="empty-state px-2">No workspaces yet.</p>
		{/each}
	</nav>

	<div class="border-t border-zinc-800 p-3">
		<a
			href="/workspaces/new"
			class="flex w-full items-center justify-center rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
		>
			+ New Workspace
		</a>
	</div>
</aside>
