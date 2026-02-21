<script lang="ts">
  import { page } from '$app/state';
  import { workspaceStatus } from '$lib/stores/workspaceStatus.svelte';
  import StatusDot from '$lib/components/StatusDot.svelte';

  let { name, label }: { name: string; label: string } = $props();

  let active = $derived(page.url.pathname.startsWith(`/workspaces/${name}`));
</script>

<a
  href="/workspaces/{name}"
  class={[
    'flex flex-row items-center gap-2 rounded-md border border-edge-muted px-3 py-2 text-sm font-medium shadow-md transition-colors hover:bg-surface-raised',
    active ? 'text-fg' : 'text-fg-muted hover:text-fg-secondary'
  ]}
>
  <StatusDot active={workspaceStatus.isBusy(name)} pulse />
  <span class="truncate">{label}</span>
</a>
