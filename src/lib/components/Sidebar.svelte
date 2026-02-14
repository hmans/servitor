<script lang="ts">
	import { page } from '$app/state';

	type Project = { id: string; name: string };
	let { projects }: { projects: Project[] } = $props();

	function isActive(projectId: string) {
		return page.url.pathname.startsWith(`/projects/${projectId}`);
	}
</script>

<aside class="flex w-64 flex-col border-r border-zinc-800 bg-zinc-900">
	<div class="border-b border-zinc-800 p-4">
		<h1 class="text-lg font-bold tracking-tight">Servitor</h1>
	</div>

	<nav class="flex-1 overflow-auto p-3">
		<div class="mb-2 px-2 text-xs font-medium tracking-wider text-zinc-500 uppercase">
			Projects
		</div>

		{#each projects as proj}
			<a
				href="/projects/{proj.id}"
				class="block rounded-md px-3 py-2 text-sm transition-colors {isActive(proj.id)
					? 'bg-zinc-800 text-zinc-100'
					: 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}"
			>
				{proj.name}
			</a>
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
