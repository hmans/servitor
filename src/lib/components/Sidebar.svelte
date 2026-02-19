<script lang="ts">
	import { page } from '$app/state';

	type Conversation = { id: number; title: string };
	type Workspace = {
		name: string;
		branch: string;
		conversations: Conversation[];
	};

	let { workspaces, projectName }: { workspaces: Workspace[]; projectName: string } = $props();

	function isActiveWorkspace(wsName: string) {
		return page.url.pathname.startsWith(`/workspaces/${wsName}`);
	}

	function isActiveConversation(convId: number) {
		return page.url.searchParams.get('conv') === String(convId);
	}
</script>

<aside class="flex h-full w-full flex-col bg-zinc-900">
	<div class="border-b border-zinc-800 p-4">
		<a href="/" class="text-lg font-bold tracking-tight hover:text-white">{projectName}</a>
	</div>

	<nav class="flex-1 overflow-auto p-3">
		{#each workspaces as ws}
			<div class="mb-1">
				<a
					href="/workspaces/{ws.name}"
					class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors {isActiveWorkspace(ws.name)
						? 'text-zinc-100'
						: 'text-zinc-400 hover:text-zinc-200'}"
				>
					<span class="truncate">{ws.name}</span>
					<span class="shrink-0 font-mono text-xs text-zinc-600">{ws.branch}</span>
				</a>

				<div class="ml-2 border-l border-zinc-800 pl-2">
					{#each ws.conversations as conv}
						<a
							href="/workspaces/{ws.name}?conv={conv.id}"
							class="block truncate rounded-md px-2 py-1.5 text-sm transition-colors {isActiveConversation(conv.id)
								? 'text-zinc-100'
								: 'text-zinc-500 hover:text-zinc-300'}"
						>
							{conv.title}
						</a>
					{/each}
				</div>
			</div>
		{:else}
			<p class="px-3 py-2 text-sm text-zinc-600">No workspaces yet.</p>
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
