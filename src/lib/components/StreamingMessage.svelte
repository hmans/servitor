<script lang="ts">
  import Markdown from '$lib/components/Markdown.svelte';
  import OptionButton from '$lib/components/OptionButton.svelte';
  import { toolIcon, humanizeToolUse } from '$lib/utils/tool-display';

  import type { AskUserQuestion } from '$lib/server/agents/types';

  type StreamingPart =
    | { type: 'text'; text: string }
    | { type: 'thinking'; text: string }
    | { type: 'tool_use'; tool: string; input: string; toolUseId: string }
    | { type: 'enter_plan'; toolUseId: string; answered: boolean }
    | {
        type: 'ask_user';
        toolUseId: string;
        questions: AskUserQuestion[];
        answered: boolean;
        submittedAnswers?: Record<string, string>;
      }
    | {
        type: 'exit_plan';
        toolUseId: string;
        allowedPrompts?: Array<{ tool: string; prompt: string }>;
        planContent?: string;
        planFilePath?: string;
        answered: boolean;
      };

  let {
    streamingParts,
    verbose,
    textRevealed,
    thinkingRevealed,
    lastStreamingTextIndex,
    onenterplan,
    onasksubmit,
    oncustomanswer,
    onplanapproval
  }: {
    streamingParts: StreamingPart[];
    verbose: boolean;
    textRevealed: string;
    thinkingRevealed: string;
    lastStreamingTextIndex: number;
    onenterplan: (approved: boolean) => void;
    onasksubmit: (
      toolUseId: string,
      questions: AskUserQuestion[],
      answers: Record<string, string>
    ) => void;
    oncustomanswer: (toolUseId: string, content: string) => void;
    onplanapproval: (approved: boolean) => void;
  } = $props();

  // Local ask-user state
  let pendingAnswers: Record<string, Record<string, string>> = $state({});
  let customAnswer: Record<string, string> = $state({});
  let previewOption: Record<string, Record<string, string>> = $state({});

  function isOptionPending(toolUseId: string, questionText: string, label: string): boolean {
    const answer = pendingAnswers[toolUseId]?.[questionText] ?? '';
    return answer.split(', ').filter(Boolean).includes(label);
  }

  function wasOptionSelected(
    answers: Record<string, string>,
    questionText: string,
    label: string
  ): boolean {
    const answer = answers[questionText] ?? '';
    return answer.split(', ').filter(Boolean).includes(label);
  }

  function selectOption(
    toolUseId: string,
    question: AskUserQuestion,
    label: string,
    allQuestions: AskUserQuestion[]
  ) {
    if (!pendingAnswers[toolUseId]) {
      pendingAnswers[toolUseId] = {};
    }

    if (question.multiSelect) {
      const current = pendingAnswers[toolUseId][question.question] ?? '';
      const selected = current.split(', ').filter(Boolean);
      const idx = selected.indexOf(label);
      if (idx >= 0) {
        selected.splice(idx, 1);
      } else {
        selected.push(label);
      }
      pendingAnswers[toolUseId][question.question] = selected.join(', ');
    } else {
      pendingAnswers[toolUseId][question.question] = label;
    }

    // Auto-submit for single-select with a single question
    if (!question.multiSelect && allQuestions.length === 1) {
      submitAnswers(toolUseId, allQuestions);
    }
  }

  function focusPreview(toolUseId: string, questionText: string, label: string) {
    if (!previewOption[toolUseId]) previewOption[toolUseId] = {};
    previewOption[toolUseId][questionText] = label;
  }

  function needsSubmitButton(questions: AskUserQuestion[]): boolean {
    return questions.length > 1 || questions.some((q) => q.multiSelect);
  }

  function formatAnswer(questions: AskUserQuestion[], answers: Record<string, string>): string {
    const parts: string[] = [];
    for (const q of questions) {
      const answer = answers[q.question];
      if (answer) {
        parts.push(`For "${q.question}", I selected: ${answer}`);
      }
    }
    return parts.join('\n\n');
  }

  function submitAnswers(toolUseId: string, questions: AskUserQuestion[]) {
    const answers = pendingAnswers[toolUseId] ?? {};
    const content = formatAnswer(questions, answers);
    if (!content) return;

    delete pendingAnswers[toolUseId];
    delete previewOption[toolUseId];

    onasksubmit(toolUseId, questions, answers);
  }

  function submitCustomAnswer(toolUseId: string) {
    const content = customAnswer[toolUseId]?.trim();
    if (!content) return;

    delete customAnswer[toolUseId];
    delete pendingAnswers[toolUseId];
    delete previewOption[toolUseId];

    oncustomanswer(toolUseId, content);
  }

  // For non-verbose streaming: find the last tool_use part and count prior ones
  const toolUseParts = $derived(
    streamingParts
      .map((p, i) => ({ part: p, index: i }))
      .filter((x) => x.part.type === 'tool_use')
  );
  const lastToolUse = $derived(toolUseParts.length > 0 ? toolUseParts[toolUseParts.length - 1] : null);
  const priorToolCount = $derived(toolUseParts.length > 1 ? toolUseParts.length - 1 : 0);
</script>

<div class="space-y-3">
  {#if thinkingRevealed && verbose}
    <div class="flex items-start gap-3">
      <span class="icon-[uil--brain] mt-0.5 shrink-0 text-zinc-600"></span>
      <div class="min-w-0 flex-1 text-sm text-zinc-500">
        <Markdown content={thinkingRevealed} />
      </div>
    </div>
  {/if}
  {#each streamingParts as part, i (i)}
    {#if part.type === 'text'}
      {@const isLast = i === lastStreamingTextIndex}
      {@const text = isLast ? textRevealed : part.text}
      {#if text}
        <div class="flex items-start gap-3">
          <span class="icon-[uil--comment-alt] mt-0.5 shrink-0 text-zinc-600"></span>
          <div class="min-w-0 flex-1 text-sm text-zinc-300">
            <Markdown content={text} />
          </div>
        </div>
      {/if}
    {:else if part.type === 'tool_use'}
      {#if verbose}
        <div class="flex items-start gap-3">
          <span class={[toolIcon(part.tool), 'mt-0.5 shrink-0 text-zinc-600']}></span>
          <div class="min-w-0 flex-1 text-sm text-zinc-500">
            {humanizeToolUse(part.tool, part.input)}
          </div>
        </div>
      {:else if lastToolUse && i === lastToolUse.index}
        <div class="flex items-start gap-3">
          <span class={[toolIcon(part.tool), 'mt-0.5 shrink-0 text-zinc-600']}></span>
          <div class="min-w-0 flex-1 text-sm text-zinc-500">
            {humanizeToolUse(part.tool, part.input)}
            {#if priorToolCount > 0}
              <span class="ml-2 text-zinc-700">+{priorToolCount} more</span>
            {/if}
          </div>
        </div>
      {/if}
    {:else if part.type === 'enter_plan'}
      <div class="flex items-start gap-3">
        <span class="icon-[uil--map] mt-1 shrink-0 text-amber-600"></span>
        <div class="card my-3 flex-1 border-amber-700/50 bg-amber-500/5 p-4">
          <div class="section-label text-amber-600">Enter Plan Mode</div>
          <div class="mb-3 text-sm text-zinc-300">
            The agent wants to plan before implementing. Switch to plan mode?
          </div>
          {#if !part.answered}
            <div class="flex gap-2">
              <button
                onclick={() => onenterplan(true)}
                class="rounded border border-amber-600 px-4 py-1.5 text-sm text-amber-400 transition-colors hover:bg-amber-500/20"
              >
                [plan first]
              </button>
              <button
                onclick={() => onenterplan(false)}
                class="rounded border border-zinc-600 px-4 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-500/20"
              >
                [just build]
              </button>
            </div>
          {/if}
        </div>
      </div>
    {:else if part.type === 'ask_user'}
      <div class="flex items-start gap-3">
        <span class="icon-[uil--question-circle] mt-1 shrink-0 text-pink-400/70"></span>
        <div class="card my-3 flex-1 p-4">
          {#each part.questions as q}
            <div class="mb-4 last:mb-0">
              <div class="section-label">
                {q.header}
              </div>
              <div class="mb-3 text-sm text-zinc-200">{q.question}</div>
              {#if part.answered}
                <!-- Readonly options -->
                <div class="flex flex-wrap gap-2">
                  {#each q.options as option}
                    <OptionButton
                      label={option.label}
                      selected={wasOptionSelected(part.submittedAnswers ?? {}, q.question, option.label)}
                      disabled
                    />
                  {/each}
                </div>
              {:else}
                <!-- Interactive options -->
                {@const hasMarkdown = q.options.some((o) => o.markdown)}
                {#if hasMarkdown}
                  <!-- Side-by-side: option list + markdown preview -->
                  <div class="flex gap-4">
                    <div class="flex w-1/3 flex-col gap-1.5">
                      {#each q.options as option}
                        <OptionButton
                          label={option.label}
                          description={option.description}
                          selected={isOptionPending(part.toolUseId, q.question, option.label)}
                          onmouseenter={() => focusPreview(part.toolUseId, q.question, option.label)}
                          onclick={() => selectOption(part.toolUseId, q, option.label, part.questions)}
                        />
                      {/each}
                    </div>
                    <div class="flex-1 overflow-auto rounded border border-zinc-700 bg-zinc-900/50 p-3">
                      {#if q.options.find((o) => o.label === previewOption[part.toolUseId]?.[q.question])?.markdown}
                        <pre class="font-mono text-xs whitespace-pre-wrap text-zinc-400">{q.options.find(
                            (o) => o.label === previewOption[part.toolUseId]?.[q.question]
                          )?.markdown}</pre>
                      {:else}
                        <span class="text-xs text-zinc-600">Hover an option to preview</span>
                      {/if}
                    </div>
                  </div>
                {:else}
                  <!-- Horizontal buttons (no markdown) -->
                  <div class="flex flex-wrap gap-2">
                    {#each q.options as option}
                      <OptionButton
                        label={option.label}
                        selected={isOptionPending(part.toolUseId, q.question, option.label)}
                        onclick={() => selectOption(part.toolUseId, q, option.label, part.questions)}
                      />
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
          {#if !part.answered && needsSubmitButton(part.questions)}
            {@const answeredCount = Object.keys(
              pendingAnswers[part.toolUseId] ?? {}
            ).filter((k) => pendingAnswers[part.toolUseId][k]).length}
            <div class="mt-4 flex items-center gap-3 border-t border-zinc-700/50 pt-3">
              <button
                onclick={() => submitAnswers(part.toolUseId, part.questions)}
                disabled={answeredCount === 0}
                class="rounded border border-pink-600 px-4 py-1.5 text-sm text-pink-400 transition-colors hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:opacity-30"
              >
                [submit {answeredCount}/{part.questions.length}]
              </button>
              <span class="text-xs text-zinc-600">
                {answeredCount === part.questions.length
                  ? 'All answered'
                  : `${part.questions.length - answeredCount} unanswered`}
              </span>
            </div>
          {/if}
          {#if !part.answered}
            <div class="mt-3 flex items-end gap-2 border-t border-zinc-700/50 pt-3">
              <span class="pb-1.5 text-xs text-zinc-600">or</span>
              <input
                type="text"
                bind:value={customAnswer[part.toolUseId]}
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitCustomAnswer(part.toolUseId);
                  }
                }}
                placeholder="Type a custom answer..."
                class="flex-1 bg-transparent py-1 text-sm text-pink-400 placeholder-zinc-700 focus:outline-none"
              />
              <button
                onclick={() => submitCustomAnswer(part.toolUseId)}
                disabled={!customAnswer[part.toolUseId]?.trim()}
                class="bracket-btn pb-0.5"
              >
                [reply]
              </button>
            </div>
          {/if}
        </div>
      </div>
    {:else if part.type === 'exit_plan'}
      <div class="flex items-start gap-3">
        <span class="icon-[uil--file-check-alt] mt-1 shrink-0 text-amber-600"></span>
        <div class="card my-3 flex-1 p-4">
          <div class="section-label flex items-center gap-3 text-amber-600">
            <span>Plan Approval</span>
            {#if part.planFilePath}
              <span class="tracking-normal text-zinc-600 normal-case"
                >{part.planFilePath}</span
              >
            {/if}
          </div>
          {#if part.planContent}
            <details open={!part.answered}>
              <summary
                class="mb-2 cursor-pointer text-xs text-zinc-500 hover:text-zinc-400"
              >
                {part.answered ? 'Show plan' : 'Plan details'}
              </summary>
              <div
                class="mb-4 max-h-[60vh] overflow-auto rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300"
              >
                <Markdown content={part.planContent} />
              </div>
            </details>
          {/if}
          {#if part.allowedPrompts?.length}
            <div class="mb-3 text-xs text-zinc-500">
              Requested permissions: {part.allowedPrompts
                .map((p) => `${p.tool}: ${p.prompt}`)
                .join(', ')}
            </div>
          {/if}
          {#if !part.answered}
            <div class="flex gap-2">
              <button
                onclick={() => onplanapproval(true)}
                class="rounded border border-green-600 px-4 py-1.5 text-sm text-green-400 transition-colors hover:bg-green-500/20"
              >
                [approve]
              </button>
              <button
                onclick={() => onplanapproval(false)}
                class="rounded border border-red-600 px-4 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/20"
              >
                [reject]
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/each}
</div>
