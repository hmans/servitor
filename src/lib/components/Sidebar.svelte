<script lang="ts">
	import { page } from '$app/state';

	type Conversation = { id: string; workspaceId: string; title: string };
	type Workspace = {
		id: string;
		projectId: string;
		name: string;
		branch: string;
		conversations: Conversation[];
	};
	type Project = { id: string; name: string; workspaces: Workspace[] };

	let { projects }: { projects: Project[] } = $props();

	function isActiveProject(projectId: string) {
		return page.url.pathname.startsWith(`/projects/${projectId}`);
	}

	function isActiveWorkspace(projectId: string, wsId: string) {
		return page.url.pathname.startsWith(`/projects/${projectId}/workspaces/${wsId}`);
	}

	function isActiveConversation(convId: string) {
		return page.url.searchParams.get('conv') === convId;
	}
</script>

<aside class="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
	<div class="border-b border-zinc-800 p-4">
		<a href="/" class="text-lg font-bold tracking-tight hover:text-white">Servitor</a>
	</div>

	<nav class="flex-1 overflow-auto p-3">
		{#each projects as proj}
			<!-- Project -->
			<div class="mb-1">
				<a
					href="/projects/{proj.id}"
					class="flex items-center rounded-md px-2 py-1.5 text-sm font-medium transition-colors {isActiveProject(proj.id)
						? 'text-zinc-100'
						: 'text-zinc-400 hover:text-zinc-200'}"
				>
					{proj.name}
				</a>

				<div class="ml-2 border-l border-zinc-800 pl-2">
					{#each proj.workspaces as ws}
						<div class="mb-0.5">
							<a
								href="/projects/{proj.id}/workspaces/{ws.id}"
								class="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors {isActiveWorkspace(proj.id, ws.id)
									? 'text-zinc-100'
									: 'text-zinc-500 hover:text-zinc-300'}"
							>
								<span class="truncate">{ws.name}</span>
								<span class="shrink-0 font-mono text-xs text-zinc-600">{ws.branch}</span>
							</a>

							<div class="ml-2 border-l border-zinc-800 pl-2">
								{#each ws.conversations as conv}
									<a
										href="/projects/{proj.id}/workspaces/{ws.id}?conv={conv.id}"
										class="block truncate rounded-md px-2 py-1 text-xs transition-colors {isActiveConversation(conv.id)
											? 'text-zinc-100'
											: 'text-zinc-500 hover:text-zinc-300'}"
									>
										{conv.title}
									</a>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<p class="px-3 py-2 text-sm text-zinc-600">No projects yet.</p>
		{/each}
	</nav>

	<div class="border-t border-zinc-800 p-3">
		<a
			href="/projects/new"
			class="flex w-full items-center justify-center rounded-md bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
		>
			+ New Project
		</a>
	</div>
</aside>
