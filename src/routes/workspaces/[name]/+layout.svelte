<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import InfoPane from '$lib/components/InfoPane.svelte';
  import PaneResizer from '$lib/components/PaneResizer.svelte';

  let { data, children } = $props();

  let infoPaneWidth = $state(400);

  $effect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        invalidateAll();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  });
</script>

<svelte:head><title>{data.workspace.label} - Servitor</title></svelte:head>

<div class="flex h-full">
  <!-- Main content -->
  {@render children()}

  <!-- Resizer -->
  <PaneResizer bind:width={infoPaneWidth} min={250} max={700} side="right" storageKey="pane:info" />

  <!-- Info pane -->
  <div
    class="hidden shrink-0 overflow-auto bg-zinc-900 px-4 lg:block"
    style:width="{infoPaneWidth}px"
  >
    <InfoPane
      commits={data.commits}
      committedDiff={data.committedDiff}
      committedStatus={data.committedStatus}
      uncommittedDiff={data.uncommittedDiff}
      uncommittedStatus={data.uncommittedStatus}
    />
  </div>
</div>
