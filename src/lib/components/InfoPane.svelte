<script lang="ts">
  import type { Commit, FileStatus } from '$lib/server/git';
  import DiffViewer from './DiffViewer.svelte';

  let {
    commits,
    committedDiff,
    committedStatus,
    uncommittedDiff,
    uncommittedStatus
  }: {
    commits: Commit[];
    committedDiff: string;
    committedStatus: FileStatus[];
    uncommittedDiff: string;
    uncommittedStatus: FileStatus[];
  } = $props();

  let view: 'status' | 'commits' | 'diff' = $state('status');

  const statusColor: Record<string, string> = {
    modified: 'text-yellow-400',
    added: 'text-green-400',
    deleted: 'text-red-400',
    untracked: 'text-fg-muted',
    renamed: 'text-blue-400'
  };

  const statusLabel: Record<string, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    untracked: '?',
    renamed: 'R'
  };

  let totalStatusCount = $derived(committedStatus.length + uncommittedStatus.length);
</script>

{#snippet fileList(files: FileStatus[])}
  <div class="space-y-0.5 font-mono text-xs">
    {#each files as file}
      <div class="flex items-center gap-2">
        <span class={['w-3 shrink-0', statusColor[file.status]]}>{statusLabel[file.status]}</span>
        <span class="min-w-0 flex-1 truncate text-fg-secondary" title={file.path}>{file.path}</span>
        {#if file.additions > 0 || file.deletions > 0}
          <span class="shrink-0 text-green-400">+{file.additions}</span>
          <span class="shrink-0 text-red-400">-{file.deletions}</span>
        {/if}
      </div>
    {/each}
  </div>
{/snippet}

<div class="flex h-full flex-col">
  <!-- Toggle buttons -->
  <div class="flex gap-1 border-b border-edge p-3">
    <button
      onclick={() => (view = 'status')}
      class={['tab-btn', view === 'status' && 'bg-surface-hover text-fg']}
    >
      Status{#if totalStatusCount > 0}<span class="ml-1 text-fg-muted">({totalStatusCount})</span
        >{/if}
    </button>
    <button
      onclick={() => (view = 'commits')}
      class={['tab-btn', view === 'commits' && 'bg-surface-hover text-fg']}
    >
      Commits ({commits.length})
    </button>
    <button
      onclick={() => (view = 'diff')}
      class={['tab-btn', view === 'diff' && 'bg-surface-hover text-fg']}
    >
      Diff
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-auto pt-3">
    {#if view === 'status'}
      {#if totalStatusCount === 0}
        <p class="empty-state">Working tree clean.</p>
      {:else}
        {#if uncommittedStatus.length > 0}
          <div class="mb-4">
            <h3 class="section-label">Uncommitted</h3>
            {@render fileList(uncommittedStatus)}
          </div>
        {/if}
        {#if committedStatus.length > 0}
          <div>
            <h3 class="section-label">Committed</h3>
            {@render fileList(committedStatus)}
          </div>
        {/if}
      {/if}
    {:else if view === 'commits'}
      {#if commits.length === 0}
        <p class="empty-state">No commits on this branch yet.</p>
      {:else}
        <div class="space-y-3">
          {#each commits as commit (commit.hash)}
            <div class="card px-3 py-2">
              <p class="text-sm text-fg-secondary">{commit.message}</p>
              <div class="mt-1 flex items-center gap-2 text-xs text-fg-muted">
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
    {:else if !uncommittedDiff && !committedDiff}
      <p class="empty-state">No diff against base branch.</p>
    {:else}
      {#if uncommittedDiff}
        <div class="mb-4">
          <h3 class="section-label">Uncommitted</h3>
          <DiffViewer diff={uncommittedDiff} />
        </div>
      {/if}
      {#if committedDiff}
        <div>
          <h3 class="section-label">Committed</h3>
          <DiffViewer diff={committedDiff} />
        </div>
      {/if}
    {/if}
  </div>
</div>
