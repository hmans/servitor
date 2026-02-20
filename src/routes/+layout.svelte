<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import PaneResizer from '$lib/components/PaneResizer.svelte';
  import { workspaceStatus } from '$lib/stores/workspaceStatus.svelte';

  let { data, children } = $props();

  let sidebarWidth = $state(256);

  $effect(() => {
    workspaceStatus.connect();
    return () => workspaceStatus.disconnect();
  });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex h-screen bg-zinc-950 text-zinc-100">
  <div class="shrink-0 border-r border-zinc-800" style:width="{sidebarWidth}px">
    <Sidebar workspaces={data.workspaces} projectName={data.projectName} />
  </div>

  <PaneResizer
    bind:width={sidebarWidth}
    min={180}
    max={480}
    side="left"
    storageKey="pane:sidebar"
  />

  <main class="min-h-0 flex-1 overflow-hidden">
    {@render children()}
  </main>
</div>
