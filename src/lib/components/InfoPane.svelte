<script lang="ts">
	import type { Commit, FileStatus } from '$lib/server/git';
	import DiffViewer from './DiffViewer.svelte';

	let { commits, diff, gitStatus }: { commits: Commit[]; diff: string; gitStatus: FileStatus[] } =
		$props();

	let view: 'status' | 'commits' | 'diff' = $state('status');

	const statusColor: Record<string, string> = {
		modified: 'text-yellow-400',
		added: 'text-green-400',
		deleted: 'text-red-400',
		untracked: 'text-zinc-500',
		renamed: 'text-blue-400'
	};

	const statusLabel: Record<string, string> = {
		modified: 'M',
		added: 'A',
		deleted: 'D',
		untracked: '?',
		renamed: 'R'
	};
</script>

<div class="flex h-full flex-col">
	<!-- Toggle buttons -->
	<div class="flex gap-1 border-b border-zinc-800 pb-3">
		<button
			onclick={() => (view = 'status')}
			class="rounded px-3 py-1.5 text-sm font-medium transition-colors {view === 'status'
				? 'bg-zinc-700 text-zinc-100'
				: 'text-zinc-400 hover:text-zinc-200'}"
		>
			Status{#if gitStatus.length > 0}<span class="ml-1 text-xs text-zinc-400">({gitStatus.length})</span>{/if}
		</button>
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
		{#if view === 'status'}
			{#if gitStatus.length === 0}
				<p class="text-sm text-zinc-600">Working tree clean.</p>
			{:else}
				<div class="space-y-0.5 font-mono text-xs">
					{#each gitStatus as file}
						<div class="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-800/50">
							<span class="w-3 shrink-0 {statusColor[file.status]}">{statusLabel[file.status]}</span>
							<span class="min-w-0 flex-1 truncate text-zinc-300" title={file.path}>{file.path}</span>
							{#if file.additions > 0 || file.deletions > 0}
								<span class="shrink-0 text-green-400">+{file.additions}</span>
								<span class="shrink-0 text-red-400">-{file.deletions}</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{:else if view === 'commits'}
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
