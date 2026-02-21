<script lang="ts">
  import { enhance } from '$app/forms';

  let { form } = $props();
</script>

<svelte:head><title>New Workspace - Servitor</title></svelte:head>

<div class="mx-auto max-w-lg bg-surface-alt p-6">
  <h2 class="mb-6 text-2xl font-bold">New Workspace</h2>

  <form method="POST" use:enhance class="space-y-4">
    {#if form?.error}
      <div class="rounded-md bg-error-surface px-4 py-3 text-sm text-red-400">
        {form.error}
      </div>
    {/if}

    <div>
      <label for="name" class="mb-1 block text-sm font-medium text-fg-secondary">Name</label>
      <input
        id="name"
        name="name"
        type="text"
        required
        value={form?.name ?? ''}
        class="w-full rounded-md border border-edge-muted bg-surface-raised px-3 py-2 text-fg placeholder-fg-muted focus:border-edge-strong focus:outline-none"
        placeholder="fix-login-bug"
      />
      <p class="mt-1 text-xs text-fg-muted">
        Lowercase, hyphens OK. Branch will be <span class="font-mono">servitor/&lt;name&gt;</span>.
      </p>
    </div>

    <div class="flex gap-3 pt-2">
      <button
        type="submit"
        class="rounded-md bg-surface-inverse px-4 py-2 text-sm font-medium text-fg-inverse transition-colors hover:bg-fg"
      >
        Create Workspace
      </button>
      <a
        href="/"
        class="rounded-md px-4 py-2 text-sm text-fg-muted transition-colors hover:text-fg-secondary"
      >
        Cancel
      </a>
    </div>
  </form>
</div>
