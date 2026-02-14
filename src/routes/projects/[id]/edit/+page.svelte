<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<div class="mx-auto max-w-lg">
	<h2 class="mb-6 text-2xl font-bold">Edit Project</h2>

	<form method="POST" action="?/update" use:enhance class="space-y-4">
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
				value={form?.name ?? data.project.name}
				class="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
			/>
		</div>

		<div>
			<label for="repoPath" class="mb-1 block text-sm font-medium text-zinc-300"
				>Repository Path</label
			>
			<input
				id="repoPath"
				name="repoPath"
				type="text"
				required
				value={form?.repoPath ?? data.project.repoPath}
				class="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
			/>
		</div>

		<div class="flex gap-3 pt-2">
			<button
				type="submit"
				class="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
			>
				Save Changes
			</button>
			<a
				href="/projects/{data.project.id}"
				class="rounded-md px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
			>
				Cancel
			</a>
		</div>
	</form>

	<div class="mt-12 border-t border-zinc-800 pt-6">
		<h3 class="mb-2 text-sm font-medium text-red-400">Danger Zone</h3>
		<form method="POST" action="?/delete" use:enhance>
			<button
				type="submit"
				onclick={(e: MouseEvent) => { if (!confirm('Delete this project? This cannot be undone.')) e.preventDefault(); }}
				class="rounded-md border border-red-800 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-900/30"
			>
				Delete Project
			</button>
		</form>
	</div>
</div>
