<script lang="ts">
  import { Canvas } from '@threlte/core';
  import ServitorBitScene from './ServitorBitScene.svelte';

  let {
    pulse = 0,
    busy = false,
    toolEmojiId = 0,
    toolEmoji = '',
    onclick: onClickProp
  }: {
    pulse?: number;
    busy?: boolean;
    toolEmojiId?: number;
    toolEmoji?: string;
    onclick?: () => void;
  } = $props();

  let extraPulse = $state(0);
  let particles: Array<{ id: number; x: number; y: number; emoji: string }> = $state([]);
  let particleId = 0;

  function spawnParticles(emojis: string[], count: number) {
    const newParticles: typeof particles = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: particleId++,
        x: 25 + Math.random() * 50,
        y: 20 + Math.random() * 40,
        emoji: emojis[Math.floor(Math.random() * emojis.length)]
      });
    }
    particles = [...particles, ...newParticles];

    setTimeout(() => {
      particles = particles.slice(count);
    }, 2200);
  }

  function onClick() {
    extraPulse++;
    spawnParticles(['♥️'], 1 + Math.floor(Math.random() * 2));
    onClickProp?.();
  }

  // Spawn tool emojis when tools are invoked
  let lastToolEmojiId = 0;
  $effect(() => {
    if (toolEmojiId > lastToolEmojiId && toolEmoji) {
      spawnParticles([toolEmoji], 1);
    }
    lastToolEmojiId = toolEmojiId;
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative h-full w-full" style="overflow: visible">
  <!-- Canvas extends beyond layout box so bloom has room to propagate -->
  <div class="pointer-events-none absolute -inset-14">
    <Canvas>
      <ServitorBitScene pulse={pulse + extraPulse} {busy} />
    </Canvas>
  </div>

  <!-- Click target covering Bit's visual area -->
  <div class="absolute inset-1 cursor-pointer" onclick={onClick}></div>

  {#each particles as p (p.id)}
    <span
      class="animate-float-up pointer-events-none absolute text-xs"
      style="left: {p.x}%; top: {p.y}%"
    >
      {p.emoji}
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
  }
</style>
