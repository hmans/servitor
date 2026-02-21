<script lang="ts">
  import WorkspaceCard from '$lib/components/WorkspaceCard.svelte';
  import { theme } from '$lib/stores/theme.svelte';

  type Workspace = {
    name: string;
    label: string;
    branch: string;
    isMainWorkspace?: boolean;
  };

  let { workspaces, projectName }: { workspaces: Workspace[]; projectName: string } = $props();
</script>

<aside class="flex h-full w-full flex-col bg-surface-alt">
  <!-- Project Name -->
  <div class="flex items-center justify-between border-b border-edge p-4">
    <a href="/" class="text-lg font-bold tracking-tight hover:text-fg">{projectName}</a>
    <button
      onclick={() => theme.toggle()}
      class="text-fg-faint transition-colors hover:text-fg"
      title="Toggle theme"
    >
      <span
        class={[
          theme.current === 'dark' ? 'icon-[uil--sun]' : 'icon-[uil--moon]'
        ]}
      ></span>
    </button>
  </div>

  <!-- Workspace List -->
  <nav class="flex flex-1 flex-col gap-2 overflow-auto p-3">
    {#each workspaces as ws}
      <WorkspaceCard name={ws.name} label={ws.label} />
    {:else}
      <p class="px-2">No workspaces yet.</p>
    {/each}
  </nav>

  <!-- New Workspace Button -->
  <div class="border-t border-edge p-3">
    <a href="/workspaces/new" class="btn">
      <span class="mr-2 icon-[uil--plus]"></span>
      New Workspace
    </a>
  </div>
</aside>
