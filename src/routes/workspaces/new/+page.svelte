<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<svelte:head><title>New Workspace - Servitor</title></svelte:head>

<div class="mx-auto max-w-lg">
	<h2 class="mb-6 text-2xl font-bold">New Workspace</h2>

	<form method="POST" use:enhance class="space-y-4">
		{#if form?.error}
			<div class="rounded-md bg-red-900/50 px-4 py-3 text-sm text-red-300">
				{form.error}
			</div>
		{/if}

		<div>
			<label for="name" class="mb-1 block text-sm font-medium text-zinc-300">Name</label>
			<input
				id="name"
				name="name"
				type="text"
				required
				value={form?.name ?? ''}
				class="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
				placeholder="fix-login-bug"
			/>
			<p class="mt-1 text-xs text-zinc-500">
				Lowercase, hyphens OK. Branch will be <span class="font-mono">servitor/&lt;name&gt;</span>.
			</p>
		</div>

		<div class="flex gap-3 pt-2">
			<button
				type="submit"
				class="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
			>
				Create Workspace
			</button>
			<a
				href="/"
				class="rounded-md px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
			>
				Cancel
			</a>
		</div>
	</form>
</div>
