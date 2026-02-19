<script lang="ts">
	import { Canvas } from '@threlte/core';
	import ServitorBitScene from './ServitorBitScene.svelte';

	let { pulse = 0, busy = false }: { pulse?: number; busy?: boolean } = $props();

	let extraPulse = $state(0);
	let hearts: Array<{ id: number; x: number; y: number }> = $state([]);
	let heartId = 0;

	function onClick() {
		extraPulse++;

		// Spawn 3-5 hearts at random positions around the center
		const count = 3 + Math.floor(Math.random() * 3);
		for (let i = 0; i < count; i++) {
			hearts = [
				...hearts,
				{
					id: heartId++,
					x: 30 + Math.random() * 40,
					y: 30 + Math.random() * 30
				}
			];
		}

		// Clean up hearts after animation
		setTimeout(() => {
			hearts = hearts.slice(count);
		}, 2200);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative h-full w-full cursor-pointer" onclick={onClick}>
	<Canvas>
		<ServitorBitScene pulse={pulse + extraPulse} {busy} />
	</Canvas>

	{#each hearts as heart (heart.id)}
		<span
			class="pointer-events-none absolute animate-float-up text-xs"
			style="left: {heart.x}%; top: {heart.y}%"
		>
			&#x2764;
		</span>
	{/each}
</div>

<style>
	@keyframes float-up {
		0% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
		100% {
			opacity: 0;
			transform: translateY(-30px) scale(0.5);
		}
	}

	:global(.animate-float-up) {
		animation: float-up 2s ease-out forwards;
		color: #ef4444;
	}
</style>
