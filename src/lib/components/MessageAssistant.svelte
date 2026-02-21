<script lang="ts">
  import Markdown from '$lib/components/Markdown.svelte';
  import { toolIcon, humanizeToolUse } from '$lib/utils/tool-display';

  import type { MessagePart } from '$lib/server/conversations';

  let {
    content,
    thinking,
    verbose,
    parts,
    toolInvocations
  }: {
    content: string;
    thinking?: string;
    verbose: boolean;
    parts?: MessagePart[];
    toolInvocations?: Array<{ tool: string; toolUseId: string; input: string }>;
  } = $props();

  /** Build a summary like "Read x4, Bash x2" from a list of tool names */
  function summarizeTools(tools: string[]): string {
    const counts = new Map<string, number>();
    for (const t of tools) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, n]) => `${name} x${n}`).join(', ');
  }

  // Collect all tool names for summary mode
  const allToolNames = $derived.by(() => {
    if (parts?.length) {
      return parts.filter((p) => p.type === 'tool_use').map((p) => (p as { tool: string }).tool);
    }
    return toolInvocations?.map((t) => t.tool) ?? [];
  });
</script>

{#if thinking && verbose}
  <div class="flex items-start gap-3">
    <span class="icon-[uil--brain] mt-0.5 shrink-0 text-fg-faint"></span>
    <div class="min-w-0 flex-1 text-sm text-fg-muted">
      <Markdown content={thinking} />
    </div>
  </div>
{/if}
{#if parts?.length}
  {#if verbose}
    {#each parts as part}
      {#if part.type === 'text'}
        <div class="flex items-start gap-3">
          <span class="icon-[uil--comment-alt] mt-0.5 shrink-0 text-fg-faint"></span>
          <div class="min-w-0 flex-1 text-sm text-fg-secondary">
            <Markdown content={part.text} />
          </div>
        </div>
      {:else if part.type === 'tool_use'}
        <div class="flex items-start gap-3">
          <span class={[toolIcon(part.tool), 'mt-0.5 shrink-0 text-fg-faint']}></span>
          <div class="min-w-0 flex-1 truncate text-sm text-fg-muted">
            {humanizeToolUse(part.tool, part.input)}
          </div>
        </div>
      {/if}
    {/each}
  {:else}
    {#if allToolNames.length > 0}
      <div class="flex items-start gap-3">
        <span class="icon-[uil--wrench] mt-0.5 shrink-0 text-fg-faint"></span>
        <div class="min-w-0 flex-1 text-sm text-fg-faint">
          {summarizeTools(allToolNames)}
        </div>
      </div>
    {/if}
    {#each parts as part}
      {#if part.type === 'text'}
        <div class="flex items-start gap-3">
          <span class="icon-[uil--comment-alt] mt-0.5 shrink-0 text-fg-faint"></span>
          <div class="min-w-0 flex-1 text-sm text-fg-secondary">
            <Markdown content={part.text} />
          </div>
        </div>
      {/if}
    {/each}
  {/if}
{:else}
  {#if verbose}
    {#if toolInvocations?.length}
      {#each toolInvocations as tool}
        <div class="flex items-start gap-3">
          <span class={[toolIcon(tool.tool), 'mt-0.5 shrink-0 text-fg-faint']}></span>
          <div class="min-w-0 flex-1 truncate text-sm text-fg-muted">
            {humanizeToolUse(tool.tool, tool.input)}
          </div>
        </div>
      {/each}
    {/if}
  {:else if allToolNames.length > 0}
    <div class="flex items-start gap-3">
      <span class="icon-[uil--wrench] mt-0.5 shrink-0 text-fg-faint"></span>
      <div class="min-w-0 flex-1 text-sm text-fg-faint">
        {summarizeTools(allToolNames)}
      </div>
    </div>
  {/if}
  {#if content}
    <div class="flex items-start gap-3">
      <span class="icon-[uil--comment-alt] mt-0.5 shrink-0 text-fg-faint"></span>
      <div class="min-w-0 flex-1 text-sm text-fg-secondary">
        <Markdown {content} />
      </div>
    </div>
  {/if}
{/if}
