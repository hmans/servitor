<script lang="ts">
  import { enhance } from '$app/forms';
  import StatusDot from '$lib/components/StatusDot.svelte';

  import type { ExecutionMode } from '$lib/server/agents/types';

  let {
    label,
    active,
    executionMode,
    verbose = $bindable(),
    isMainWorkspace,
    onmodechange
  }: {
    label: string;
    active: boolean;
    executionMode: ExecutionMode;
    verbose: boolean;
    isMainWorkspace: boolean;
    onmodechange: (mode: ExecutionMode) => void;
  } = $props();
</script>

<div
  class={[
    'flex items-center justify-between p-4',
    executionMode === 'plan' ? 'border-b border-amber-500/30' : 'border-b border-edge'
  ]}
>
  <!-- Title and Status -->
  <div class="flex items-center gap-2 text-sm">
    <StatusDot {active} size="md" />
    <span class="text-fg-secondary">{label}</span>
  </div>

  <!-- Buttons -->
  <div class="flex items-center gap-2">
    <!-- Execution mode selector -->
    {#each ['plan', 'build'] as mode}
      <button
        onclick={() => onmodechange(mode as ExecutionMode)}
        class={[
          'tab-btn',
          executionMode === mode &&
            (mode === 'plan'
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-green-500/20 text-green-400')
        ]}
      >
        {mode}
      </button>
    {/each}

    <!-- Verbose toggle -->
    <button
      onclick={() => {
        verbose = !verbose;
        localStorage.setItem('verbose', String(verbose));
      }}
      class={['tab-btn', verbose ? 'text-fg-secondary' : 'text-fg-faint hover:text-fg-muted']}
    >
      verbose
    </button>

    <!-- Delete workspace -->
    {#if !isMainWorkspace}
      <form method="POST" action="?/delete" use:enhance>
        <button
          type="submit"
          onclick={(e: MouseEvent) => {
            if (!confirm('Delete this workspace and its worktree?')) e.preventDefault();
          }}
          class="tab-btn hover:text-red-400"
        >
          delete
        </button>
      </form>
    {/if}
  </div>
</div>
