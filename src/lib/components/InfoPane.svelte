<script lang="ts">
	import type { Commit } from '$lib/server/git';
	import DiffViewer from './DiffViewer.svelte';

	let { commits, diff }: { commits: Commit[]; diff: string } = $props();

	let view: 'commits' | 'diff' = $state('commits');
</script>

<div class="flex h-full flex-col">
	<!-- Toggle buttons -->
	<div class="flex gap-1 border-b border-zinc-800 pb-3">
		<button
			onclick={() => (view = 'commits')}
			class="rounded px-3 py-1.5 text-sm font-medium transition-colors {view === 'commits'
				? 'bg-zinc-700 text-zinc-100'
				: 'text-zinc-400 hover:text-zinc-200'}"
		>
			Commits ({commits.length})
		</button>
		<button
			onclick={() => (view = 'diff')}
			class="rounded px-3 py-1.5 text-sm font-medium transition-colors {view === 'diff'
				? 'bg-zinc-700 text-zinc-100'
				: 'text-zinc-400 hover:text-zinc-200'}"
		>
			Diff
		</button>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-auto pt-3">
		{#if view === 'commits'}
			{#if commits.length === 0}
				<p class="text-sm text-zinc-600">No commits on this branch yet.</p>
			{:else}
				<div class="space-y-3">
					{#each commits as commit (commit.hash)}
						<div class="rounded-lg border border-zinc-800 px-3 py-2">
							<p class="text-sm text-zinc-200">{commit.message}</p>
							<div class="mt-1 flex items-center gap-2 text-xs text-zinc-500">
								<span class="font-mono">{commit.hash.slice(0, 7)}</span>
								<span>&middot;</span>
								<span>{commit.author}</span>
								<span>&middot;</span>
								<span>{new Date(commit.date).toLocaleDateString()}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			{#if !diff}
				<p class="text-sm text-zinc-600">No diff against base branch.</p>
			{:else}
				<DiffViewer {diff} />
			{/if}
		{/if}
	</div>
</div>
