<script lang="ts">
	import { page } from '$app/state';
	import { workspaceStatus } from '$lib/stores/workspaceStatus.svelte';
	import StatusDot from '$lib/components/StatusDot.svelte';

	let { name }: { name: string } = $props();

	let active = $derived(page.url.pathname.startsWith(`/workspaces/${name}`));
</script>

<a
	href="/workspaces/{name}"
	class={[
		'flex flex-row items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium shadow-md transition-colors hover:bg-zinc-800',
		active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
	]}
>
	<StatusDot active={workspaceStatus.isBusy(name)} pulse />
	<span class="truncate">{name}</span>
</a>
