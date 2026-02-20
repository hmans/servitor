<script lang="ts">
	let {
		label,
		description,
		selected = false,
		disabled = false,
		onclick,
		onmouseenter
	}: {
		label: string;
		description?: string;
		selected?: boolean;
		disabled?: boolean;
		onclick?: () => void;
		onmouseenter?: () => void;
	} = $props();
</script>

{#if disabled}
	<span
		class={[
			"rounded border px-3 py-1.5 text-sm",
			selected ? "border-pink-500 bg-pink-500/20 text-pink-400" : "border-zinc-800 text-zinc-700"
		]}
	>
		{label}
	</span>
{:else}
	<button
		{onclick}
		{onmouseenter}
		class={[
			"rounded border px-3 py-1.5 text-sm transition-colors",
			selected
				? "border-pink-500 bg-pink-500/20 text-pink-400"
				: "border-zinc-600 text-zinc-300 hover:border-pink-500 hover:text-pink-400"
		]}
	>
		{#if description}
			<div class="text-left">
				<div>{label}</div>
				<div class="text-xs text-zinc-500">{description}</div>
			</div>
		{:else}
			{label}
		{/if}
	</button>
{/if}
