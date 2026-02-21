<script lang="ts">
  import { browser } from '$app/environment';

  let {
    width = $bindable(),
    min = 150,
    max = 600,
    side = 'left',
    storageKey
  }: {
    width: number;
    min?: number;
    max?: number;
    side?: 'left' | 'right';
    storageKey?: string;
  } = $props();

  // Restore from localStorage on mount
  $effect.pre(() => {
    if (!browser || !storageKey) return;
    const stored = localStorage.getItem(storageKey);
    if (stored != null) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) {
        width = Math.min(max, Math.max(min, parsed));
      }
    }
  });

  // Persist to localStorage on change
  $effect(() => {
    if (browser && storageKey) {
      localStorage.setItem(storageKey, String(width));
    }
  });

  let dragging = $state(false);
  let startX = 0;
  let startWidth = 0;

  function onpointerdown(e: PointerEvent) {
    dragging = true;
    startX = e.clientX;
    startWidth = width;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const raw = side === 'left' ? startWidth + delta : startWidth - delta;
    width = Math.min(max, Math.max(min, raw));
  }

  function stopDrag() {
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }

  function onkeydown(e: KeyboardEvent) {
    const step = e.shiftKey ? 50 : 10;
    if (e.key === 'ArrowRight') {
      width = Math.min(max, Math.max(min, width + (side === 'left' ? step : -step)));
    } else if (e.key === 'ArrowLeft') {
      width = Math.min(max, Math.max(min, width - (side === 'left' ? step : -step)));
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  role="separator"
  tabindex="0"
  aria-orientation="vertical"
  aria-valuenow={width}
  aria-valuemin={min}
  aria-valuemax={max}
  class="group relative flex shrink-0 cursor-col-resize items-center justify-center bg-surface-raised p-0.25"
  {onpointerdown}
  {onpointermove}
  onpointerup={stopDrag}
  onlostpointercapture={stopDrag}
  {onkeydown}
>
  <div
    class={['h-full w-px transition-colors', dragging ? 'bg-fg-muted' : ' group-hover:bg-fg-muted']}
  ></div>
</div>
