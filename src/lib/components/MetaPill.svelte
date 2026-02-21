<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    icon,
    label,
    expanded = false,
    ontoggle,
    truncate = true,
    children
  }: {
    icon: string;
    label: string;
    expanded?: boolean;
    ontoggle: () => void;
    truncate?: boolean;
    children?: Snippet;
  } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="my-1 cursor-pointer rounded bg-surface-raised/60 px-2 py-0.5 text-xs text-fg-muted"
  class:truncate={truncate && !expanded}
  onclick={ontoggle}
>
  <span class={[icon, 'mr-1 inline-block align-text-bottom']}
  ></span>{label}{#if expanded && children}{@render children()}{/if}
</div>
