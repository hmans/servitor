<script lang="ts">
  import { parseDiff } from '$lib/utils/diff-parser';

  let { diff }: { diff: string } = $props();

  let files = $derived(parseDiff(diff));
  let collapsed: Record<number, boolean> = $state({});

  function toggle(index: number) {
    collapsed[index] = !collapsed[index];
  }
</script>

<div class="space-y-2">
  {#each files as file, i (i)}
    <div class="card overflow-hidden">
      <!-- File header -->
      <button
        onclick={() => toggle(i)}
        class="flex w-full items-center gap-2 bg-surface-raised/50 px-3 py-2 text-left font-mono text-xs hover:bg-surface-raised"
      >
        <span
          class={['inline-block transition-transform', !collapsed[i] && 'rotate-90']}
          aria-hidden="true">&#9654;</span
        >
        <span class="flex-1 truncate text-fg-secondary">{file.displayPath}</span>
        {#if file.additions > 0}
          <span class="text-green-400">+{file.additions}</span>
        {/if}
        {#if file.deletions > 0}
          <span class="text-red-400">-{file.deletions}</span>
        {/if}
      </button>

      <!-- Hunks -->
      {#if !collapsed[i]}
        <div class="overflow-x-auto bg-surface-alt">
          {#each file.hunks as hunk}
            <!-- Hunk header -->
            <div
              class="border-t border-edge bg-surface-raised/30 px-3 py-1 font-mono text-xs text-cyan-400"
            >
              {hunk.header}
            </div>

            <!-- Lines table -->
            <table class="w-full border-collapse font-mono text-xs">
              <tbody>
                {#each hunk.lines as line}
                  <tr
                    class={[
                      line.type === 'addition' && 'bg-green-500/10',
                      line.type === 'deletion' && 'bg-red-500/10'
                    ]}
                  >
                    <td
                      class="w-[1px] border-r border-edge px-2 py-0 text-right whitespace-nowrap text-fg-faint select-none"
                    >
                      {line.oldLineNo ?? ''}
                    </td>
                    <td
                      class="w-[1px] border-r border-edge px-2 py-0 text-right whitespace-nowrap text-fg-faint select-none"
                    >
                      {line.newLineNo ?? ''}
                    </td>
                    <td
                      class={[
                        'px-3 py-0 whitespace-pre',
                        line.type === 'addition'
                          ? 'text-green-300'
                          : line.type === 'deletion'
                            ? 'text-red-300'
                            : 'text-fg-secondary'
                      ]}
                    >
                      {line.content}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
