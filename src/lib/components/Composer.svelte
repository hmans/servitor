<script lang="ts">
  import type { ExecutionMode } from '$lib/server/agents/types';

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  let {
    executionMode,
    active,
    onsend,
    onstop,
    composerEl = $bindable()
  }: {
    executionMode: ExecutionMode;
    active: boolean;
    onsend: (
      content: string,
      attachments?: Array<{ filename: string; mediaType: string; data: string }>
    ) => void;
    onstop: () => void;
    composerEl: HTMLTextAreaElement | undefined;
  } = $props();

  let input = $state('');
  let pendingAttachments: Array<{
    file: File;
    preview: string;
    filename: string;
    mediaType: string;
  }> = $state([]);
  let fileInputEl: HTMLInputElement | undefined = $state();
  let dragOver = $state(false);
  let errorMessage = $state('');

  function addAttachment(file: File) {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      errorMessage = `Unsupported image type: ${file.type}`;
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      errorMessage = `Image too large (max 10MB): ${file.name}`;
      return;
    }
    const preview = URL.createObjectURL(file);
    pendingAttachments = [
      ...pendingAttachments,
      { file, preview, filename: file.name, mediaType: file.type }
    ];
  }

  function removeAttachment(index: number) {
    URL.revokeObjectURL(pendingAttachments[index].preview);
    pendingAttachments = pendingAttachments.filter((_, i) => i !== index);
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files) return;
    for (const file of input.files) {
      addAttachment(file);
    }
    input.value = '';
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) addAttachment(file);
      }
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        addAttachment(file);
      }
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function send() {
    if (!input.trim() && pendingAttachments.length === 0) return;

    const content = input.trim();
    input = '';
    if (composerEl) composerEl.style.height = 'auto';
    errorMessage = '';

    let attachmentsPayload:
      | Array<{ filename: string; mediaType: string; data: string }>
      | undefined;
    if (pendingAttachments.length > 0) {
      attachmentsPayload = await Promise.all(
        pendingAttachments.map(async (a) => ({
          filename: a.filename,
          mediaType: a.mediaType,
          data: await fileToBase64(a.file)
        }))
      );
      // Don't revoke previews here — the parent handles optimistic rendering
      pendingAttachments = [];
    }

    onsend(content, attachmentsPayload);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === 'Escape' && active) {
      e.preventDefault();
      onstop();
    }
  }
</script>

{#if errorMessage}
  <div class="border-t border-error-border px-3 py-2 text-xs text-red-400">
    <span class="text-red-600">[error]</span>
    {errorMessage}
    <button onclick={() => (errorMessage = '')} class="ml-2 text-red-600 hover:text-red-400"
      >dismiss</button
    >
  </div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={[
    'px-4 pt-2 pb-4',
    executionMode === 'plan' ? 'border-t border-amber-500/30' : 'border-t border-edge',
    dragOver && 'rounded ring-1 ring-pink-500/50'
  ]}
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
>
  {#if pendingAttachments.length > 0}
    <div class="mb-2 flex gap-2">
      {#each pendingAttachments as att, i}
        <div class="group relative h-16 w-16 overflow-hidden rounded border border-edge-muted">
          <img src={att.preview} alt={att.filename} class="h-full w-full object-cover" />
          <button
            onclick={() => removeAttachment(i)}
            class="absolute -top-0.5 -right-0.5 hidden h-4 w-4 rounded-full bg-red-600 text-[10px] leading-none text-white group-hover:block"
            >x</button
          >
        </div>
      {/each}
    </div>
  {/if}
  <input
    type="file"
    accept={ACCEPTED_IMAGE_TYPES.join(',')}
    multiple
    class="hidden"
    bind:this={fileInputEl}
    onchange={handleFileSelect}
  />
  <div class="flex items-center gap-2">
    <textarea
      bind:this={composerEl}
      bind:value={input}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
      oninput={(e) => {
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 200) + 'px';
      }}
      placeholder="Ask Servitor anything..."
      rows="1"
      class="flex-1 resize-none bg-transparent py-1.5 font-mono text-sm text-pink-400 placeholder-fg-dim focus:outline-none"
    ></textarea>
    <button
      onclick={() => fileInputEl?.click()}
      class="cursor-pointer text-fg-faint transition-colors hover:text-fg-secondary"
      title="Attach image"
    >
      <span class="icon-[uil--image-plus]"></span>
    </button>
    {#if active}
      <button
        onclick={onstop}
        class="cursor-pointer text-red-600 transition-colors hover:text-red-400"
        title="Stop agent"
      >
        <span class="icon-[uil--square-full]"></span>
      </button>
    {:else}
      <button
        onclick={send}
        disabled={!input.trim() && pendingAttachments.length === 0}
        class="cursor-pointer text-fg-faint transition-colors hover:text-pink-400 disabled:cursor-not-allowed disabled:opacity-30"
        title="Send message"
      >
        <span class="icon-[uil--message]"></span>
      </button>
    {/if}
  </div>
</div>
