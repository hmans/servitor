<script lang="ts">
  import { onDestroy } from 'svelte';

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  let index = $state(0);

  const interval = setInterval(() => {
    index = (index + 1) % frames.length;
  }, 80);

  onDestroy(() => clearInterval(interval));
</script>

<span class="inline-block text-lg text-pink-400">{frames[index]}</span>
