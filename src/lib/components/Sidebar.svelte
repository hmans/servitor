<script lang="ts">
  import WorkspaceCard from '$lib/components/WorkspaceCard.svelte';

  type Workspace = {
    name: string;
    branch: string;
  };

  let { workspaces, projectName }: { workspaces: Workspace[]; projectName: string } = $props();
</script>

<aside class="flex h-full w-full flex-col bg-zinc-900">
  <!-- Project Name -->
  <div class="border-b border-zinc-800 p-4">
    <a href="/" class="text-lg font-bold tracking-tight hover:text-white">{projectName}</a>
  </div>

  <!-- Workspace List -->
  <nav class="flex flex-1 flex-col gap-2 overflow-auto p-3">
    {#each workspaces as ws}
      <WorkspaceCard name={ws.name} />
    {:else}
      <p class="px-2">No workspaces yet.</p>
    {/each}
  </nav>

  <!-- New Workspace Button -->
  <div class="border-t border-zinc-800 p-3">
    <a href="/workspaces/new" class="btn">
      <span class="mr-2 icon-[uil--plus]"></span>
      New Workspace
    </a>
  </div>
</aside>
