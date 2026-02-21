<script lang="ts">
  import OptionButton from '$lib/components/OptionButton.svelte';
  import { linkifyUrls } from '$lib/linkify';

  import type { AskUserQuestion } from '$lib/server/agents/types';
  import type { Attachment } from '$lib/server/conversations';

  let {
    content,
    attachments,
    previewUrls,
    wsName,
    askUserAnswers
  }: {
    content: string;
    attachments?: Attachment[];
    previewUrls?: string[];
    wsName: string;
    askUserAnswers?: { questions: AskUserQuestion[]; answers: Record<string, string> };
  } = $props();

  function wasOptionSelected(
    answers: Record<string, string>,
    questionText: string,
    label: string
  ): boolean {
    const answer = answers[questionText] ?? '';
    return answer.split(', ').filter(Boolean).includes(label);
  }
</script>

{#if askUserAnswers}
  <div class="flex items-start gap-3">
    <span class="icon-[uil--question-circle] mt-1 shrink-0 text-pink-400/70"></span>
    <div class="card flex-1 p-4">
      {#each askUserAnswers.questions as q}
        <div class="mb-4 last:mb-0">
          <div class="section-label">
            {q.header}
          </div>
          <div class="mb-3 text-sm text-fg-secondary">{q.question}</div>
          <div class="flex flex-wrap gap-2">
            {#each q.options as option}
              <OptionButton
                label={option.label}
                selected={wasOptionSelected(askUserAnswers?.answers ?? {}, q.question, option.label)}
                disabled
              />
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{:else}
  <div class="flex items-start gap-3">
    <span class="icon-[uil--arrow-right] mt-0.5 shrink-0 text-pink-400/70"></span>
    <div class="min-w-0 flex-1">
      {#if content}
        <div class="text-sm whitespace-pre-wrap text-pink-300">
          {@html linkifyUrls(content)}
        </div>
      {/if}
      {#if attachments?.length}
        <div class="mt-1 flex gap-2">
          {#each attachments as att, attIdx}
            {@const src =
              previewUrls?.[attIdx] ||
              (att.id ? `/api/workspaces/${wsName}/attachments/${att.id}` : '')}
            {#if src}
              <a
                href={src}
                target="_blank"
                class="block h-20 w-20 overflow-hidden rounded border border-edge-muted transition-colors hover:border-pink-500"
              >
                <img {src} alt={att.filename} class="h-full w-full object-cover" />
              </a>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
