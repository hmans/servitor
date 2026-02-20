<script lang="ts">
	let {
		active = false,
		pulse = false,
		size = 'sm' as 'sm' | 'md'
	}: {
		active?: boolean;
		pulse?: boolean;
		size?: 'sm' | 'md';
	} = $props();
</script>

<span
	class="inline-block shrink-0 rounded-full {size === 'md' ? 'h-2 w-2' : 'h-1.5 w-1.5'}
		{active
		? pulse
			? 'bg-pink-500 animate-pulse'
			: 'bg-green-500'
		: 'bg-zinc-700'}"
></span>
