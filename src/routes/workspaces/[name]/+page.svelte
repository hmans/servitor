<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate, invalidateAll } from '$app/navigation';
  import { onDestroy, tick } from 'svelte';
  import Composer from '$lib/components/Composer.svelte';
  import MessageAssistant from '$lib/components/MessageAssistant.svelte';
  import MessageUser from '$lib/components/MessageUser.svelte';
  import ServitorBit from '$lib/components/ServitorBit.svelte';
  import StreamingMessage from '$lib/components/StreamingMessage.svelte';
  import WorkspaceHeader from '$lib/components/WorkspaceHeader.svelte';

  import type { AskUserQuestion, ExecutionMode } from '$lib/server/agents/types';
  import type { Attachment, MessagePart } from '$lib/server/conversations';
  import { activity } from '$lib/stores/activity.svelte';

  let { data } = $props();

  let sending = $state(false);
  let processAlive = $state(false);
  let errorMessage = $state('');
  let executionMode: ExecutionMode = $state('build');
  let verbose = $state(browser && localStorage.getItem('verbose') === 'true');

  // Sync execution mode from server data
  $effect(() => {
    executionMode = (data.executionMode as ExecutionMode) ?? 'build';
  });
  let stuckToBottom = $state(true);
  let isProgrammaticScroll = false;

  let messagesEl: HTMLDivElement | undefined = $state();
  let composerEl: HTMLTextAreaElement | undefined = $state();

  function scrollToBottom() {
    if (!messagesEl) return;
    isProgrammaticScroll = true;
    messagesEl.scrollTop = messagesEl.scrollHeight;
    requestAnimationFrame(() => {
      isProgrammaticScroll = false;
    });
  }
  let eventSource: EventSource | null = null;

  // Typewriter: progressively reveal streamed text word by word
  function createTypewriter(pulseBit = true) {
    let revealed = $state('');
    let target = $state('');
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => {
        if (revealed.length >= target.length) {
          if (timer) clearInterval(timer);
          timer = null;
          return;
        }
        let next = target.indexOf(' ', revealed.length);
        if (next === -1) next = target.length;
        else next++;
        revealed = target.slice(0, next);
        if (pulseBit) activity.pulse();
      }, 20);
    }

    function setTarget(text: string) {
      if (text !== target) {
        target = text;
        start();
      }
    }

    function flush() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      revealed = target;
    }

    function reset() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      target = '';
      revealed = '';
    }

    return {
      get revealed() {
        return revealed;
      },
      get target() {
        return target;
      },
      setTarget,
      flush,
      reset
    };
  }

  const textTypewriter = createTypewriter(true);
  const thinkingTypewriter = createTypewriter(false);

  // Streaming state — built up as SSE events arrive
  let streamingParts: Array<
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
      }
  > = $state([]);

  // Local copy of messages for optimistic updates
  let localMessages: Array<{
    role: string;
    content: string;
    thinking?: string;
    toolInvocations?: Array<{ tool: string; toolUseId: string; input: string }>;
    parts?: MessagePart[];
    askUserAnswers?: { questions: AskUserQuestion[]; answers: Record<string, string> };
    attachments?: Attachment[];
    /** Optimistic preview URLs (object URLs) keyed by attachment index */
    _previewUrls?: string[];
    ts: string;
  }> = $state([]);

  // Sync from server data when it changes
  $effect(() => {
    localMessages = [...data.messages];
  });

  // Feed streaming text and thinking into their typewriters
  $effect(() => {
    const textParts = streamingParts.filter((p) => p.type === 'text');
    const latest = textParts.length > 0 ? textParts[textParts.length - 1] : null;
    textTypewriter.setTarget(latest?.text ?? '');

    const thinkingParts = streamingParts.filter((p) => p.type === 'thinking');
    const latestThinking =
      thinkingParts.length > 0 ? thinkingParts[thinkingParts.length - 1] : null;
    thinkingTypewriter.setTarget(latestThinking?.text ?? '');

    if (streamingParts.length === 0) {
      textTypewriter.reset();
      thinkingTypewriter.reset();
    }
  });

  // Auto-scroll: when stuck to bottom, scroll unconditionally on any DOM mutation.
  // User scroll intent is detected via a scroll event listener.
  $effect(() => {
    if (!messagesEl) return;
    const el = messagesEl;

    // Scroll to bottom on mount
    tick().then(() => {
      stuckToBottom = true;
      scrollToBottom();
    });

    // When stuck, scroll unconditionally on any DOM mutation
    const observer = new MutationObserver(() => {
      if (stuckToBottom) scrollToBottom();
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });

    // Detect user scroll intent via direction: scroll-up instantly unsticks,
    // scroll-down near the bottom re-sticks.
    let lastScrollTop = el.scrollTop;
    function handleScroll() {
      const currentTop = el.scrollTop;
      if (isProgrammaticScroll) {
        lastScrollTop = currentTop;
        return;
      }
      const scrolledUp = currentTop < lastScrollTop;
      lastScrollTop = currentTop;

      if (scrolledUp) {
        stuckToBottom = false;
      } else {
        const nearBottom = el.scrollHeight - currentTop - el.clientHeight < 80;
        stuckToBottom = nearBottom;
      }
    }
    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', handleScroll);
    };
  });

  // Focus composer on every navigation
  afterNavigate(() => {
    tick().then(() => composerEl?.focus());
  });

  const wsName = $derived(data.workspace.name);

  // Index of the last text part in streamingParts (for typewriter rendering)
  const lastStreamingTextIndex = $derived.by(() => {
    for (let i = streamingParts.length - 1; i >= 0; i--) {
      if (streamingParts[i].type === 'text') return i;
    }
    return -1;
  });


  // SSE lifecycle
  $effect(() => {
    // Touch wsName so the effect re-runs when navigating between workspaces
    const _ws = wsName;

    streamingParts = [];
    sending = false;
    processAlive = false;
    activity.setBusy(false);

    const es = new EventSource(`/api/workspaces/${_ws}/stream`);

    // Track whether message_complete already fired this turn, so the
    // done handler can skip a redundant invalidateAll().
    let turnCompleted = false;

    // Wrap addEventListener to log all SSE events for debugging
    const _addEL = es.addEventListener.bind(es);
    es.addEventListener = (type: string, listener: EventListener, ...rest: any[]) => {
      _addEL(
        type,
        (e: Event) => {
          const me = e as MessageEvent;
          try {
            console.debug(`[SSE] ${type}`, me.data ? JSON.parse(me.data) : '(no data)');
          } catch {
            console.debug(`[SSE] ${type}`, me.data ?? '(no data)');
          }
          (listener as EventListener)(e);
        },
        ...rest
      );
    };

    es.addEventListener('connected', (e) => {
      const event = JSON.parse(e.data);
      processAlive = !!event.processing;

      // If agent is mid-turn, show busy state immediately
      if (event.processing) {
        activity.setBusy(true);
      }

      // Restore pending interaction from server data if not actively processing
      if (!event.processing && data.pendingInteraction) {
        if (data.pendingInteraction.type === 'enter_plan') {
          streamingParts = [{ type: 'enter_plan', toolUseId: 'persisted', answered: false }];
        } else if (data.pendingInteraction.type === 'ask_user') {
          streamingParts = [
            {
              type: 'ask_user',
              toolUseId: 'persisted',
              questions: data.pendingInteraction.questions,
              answered: false
            }
          ];
        } else if (data.pendingInteraction.type === 'exit_plan') {
          streamingParts = [
            {
              type: 'exit_plan',
              toolUseId: 'persisted',
              allowedPrompts: data.pendingInteraction.allowedPrompts,
              planContent: data.pendingInteraction.planContent,
              planFilePath: data.pendingInteraction.planFilePath,
              answered: false
            }
          ];
        }
      }
    });

    es.addEventListener('thinking', (e) => {
      const event = JSON.parse(e.data);
      processAlive = true;
      sending = false;
      activity.setBusy(true);
      activity.pulse();
      streamingParts = [...streamingParts, { type: 'thinking', text: event.text }];
    });

    es.addEventListener('text_delta', (e) => {
      const event = JSON.parse(e.data);
      processAlive = true;
      sending = false;
      activity.setBusy(true);
      activity.pulse();
      // Consolidate: update last text part if exists, otherwise add new
      const lastPart = streamingParts[streamingParts.length - 1];
      if (lastPart?.type === 'text') {
        streamingParts = streamingParts.map((p, idx) =>
          idx === streamingParts.length - 1 ? { ...p, text: event.text } : p
        );
      } else {
        streamingParts = [...streamingParts, { type: 'text', text: event.text }];
      }
    });

    es.addEventListener('tool_use_start', (e) => {
      const event = JSON.parse(e.data);
      processAlive = true;
      sending = false;
      activity.setBusy(true);
      activity.pulse();
      activity.emitToolEmoji(event.tool);
      streamingParts = [
        ...streamingParts,
        {
          type: 'tool_use',
          tool: event.tool,
          input: event.input ?? '',
          toolUseId: event.toolUseId
        }
      ];
    });

    es.addEventListener('enter_plan', (e) => {
      const event = JSON.parse(e.data);
      sending = false;
      streamingParts = [
        ...streamingParts,
        { type: 'enter_plan', toolUseId: event.toolUseId, answered: false }
      ];
    });

    es.addEventListener('ask_user', (e) => {
      const event = JSON.parse(e.data);
      // Process will be killed by the server — don't set processAlive
      sending = false;
      streamingParts = [
        ...streamingParts,
        {
          type: 'ask_user',
          toolUseId: event.toolUseId,
          questions: event.questions,
          answered: false
        }
      ];
    });

    es.addEventListener('exit_plan', (e) => {
      const event = JSON.parse(e.data);
      // Process will be killed by the server — don't set processAlive
      sending = false;
      streamingParts = [
        ...streamingParts,
        {
          type: 'exit_plan',
          toolUseId: event.toolUseId,
          allowedPrompts: event.allowedPrompts,
          planContent: event.planContent,
          planFilePath: event.planFilePath,
          answered: false
        }
      ];
    });

    es.addEventListener('message_complete', async () => {
      turnCompleted = true;
      sending = false;
      processAlive = false;
      activity.setBusy(false);

      // Instantly finish typewriters so there's no gap
      textTypewriter.flush();
      thinkingTypewriter.flush();

      // Load persisted messages first, THEN clear streaming parts.
      // This prevents a flash where neither streaming nor persisted text is visible.
      await invalidateAll();
      streamingParts = [];

      stuckToBottom = true;
      await tick();
      scrollToBottom();
    });

    es.addEventListener('done', async () => {
      sending = false;
      processAlive = false;
      activity.setBusy(false);

      // Instantly finish typewriters
      textTypewriter.flush();
      thinkingTypewriter.flush();

      // Preserve streaming parts if there's a pending interaction
      const hasPendingInteraction = streamingParts.some(
        (p) =>
          (p.type === 'enter_plan' || p.type === 'ask_user' || p.type === 'exit_plan') &&
          !p.answered
      );

      // Skip redundant invalidateAll() if message_complete already handled it
      if (!turnCompleted) {
        await invalidateAll();
      }
      turnCompleted = false;

      if (!hasPendingInteraction) {
        streamingParts = [];
      }

      stuckToBottom = true;
      await tick();
      scrollToBottom();
    });

    es.addEventListener('error', (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data);
        if (event.message) errorMessage = event.message;
      } catch {
        // Native EventSource error
      }
      sending = false;
      processAlive = false;
      activity.setBusy(false);
      streamingParts = [];
    });

    eventSource = es;

    return () => {
      es.close();
      eventSource = null;
    };
  });

  async function sendMessage(
    content: string,
    attachments?: Array<{ filename: string; mediaType: string; data: string }>
  ) {
    sending = true;
    activity.setBusy(true);
    errorMessage = '';

    const attachmentsMeta = attachments?.map((a) => ({
      id: '',
      filename: a.filename,
      mediaType: a.mediaType,
      path: ''
    }));

    // For optimistic rendering we'd need the preview URLs from the Composer,
    // but the files have already been converted to base64. Just show metadata.
    stuckToBottom = true;
    localMessages = [
      ...localMessages,
      {
        role: 'user',
        content,
        attachments: attachmentsMeta,
        ts: new Date().toISOString()
      }
    ];

    try {
      const body: Record<string, unknown> = { content };
      if (attachments) body.attachments = attachments;

      const res = await fetch(`/api/workspaces/${wsName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send message' }));
        errorMessage = err.message ?? 'Failed to send message';
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Network error';
    }
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

  async function handleAskSubmit(
    _toolUseId: string,
    questions: AskUserQuestion[],
    answers: Record<string, string>
  ) {
    const content = formatAnswer(questions, answers);
    if (!content) return;

    streamingParts = [];
    const askUserAnswers = { questions, answers };

    sending = true;
    activity.setBusy(true);
    stuckToBottom = true;
    localMessages = [
      ...localMessages,
      { role: 'user', content, askUserAnswers, ts: new Date().toISOString() }
    ];

    try {
      const res = await fetch(`/api/workspaces/${wsName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, askUserAnswers })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send answer' }));
        errorMessage = err.message ?? 'Failed to send answer';
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to send answer';
    }
  }

  async function handleCustomAnswer(_toolUseId: string, content: string) {
    streamingParts = [];

    sending = true;
    activity.setBusy(true);
    stuckToBottom = true;
    localMessages = [...localMessages, { role: 'user', content, ts: new Date().toISOString() }];

    try {
      const res = await fetch(`/api/workspaces/${wsName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send answer' }));
        errorMessage = err.message ?? 'Failed to send answer';
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to send answer';
    }
  }

  async function setMode(mode: ExecutionMode) {
    try {
      const res = await fetch(`/api/workspaces/${wsName}/mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      if (res.ok) {
        executionMode = mode;
        // If process was running, it was killed — reflect that
        processAlive = false;
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to change mode';
    }
  }

  async function approveEnterPlan(approved: boolean) {
    streamingParts = [];
    sending = true;
    activity.setBusy(true);

    if (approved) {
      await setMode('plan');
    }

    const content = approved ? 'Yes, please plan first.' : 'No, just proceed with implementation.';

    stuckToBottom = true;
    localMessages = [...localMessages, { role: 'user', content, ts: new Date().toISOString() }];

    try {
      const res = await fetch(`/api/workspaces/${wsName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send' }));
        errorMessage = err.message ?? 'Failed to send';
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to send';
    }
  }

  async function approvePlan(approved: boolean) {
    streamingParts = [];
    sending = true;
    activity.setBusy(true);

    // Switch from plan → build on approval
    if (approved && executionMode === 'plan') {
      await setMode('build');
    }

    const content = approved
      ? 'Plan approved. Proceed with the implementation.'
      : 'Plan rejected. Please revise the plan.';

    stuckToBottom = true;
    localMessages = [...localMessages, { role: 'user', content, ts: new Date().toISOString() }];

    try {
      const res = await fetch(`/api/workspaces/${wsName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send' }));
        errorMessage = err.message ?? 'Failed to send';
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to send';
    }
  }

  async function stopProcess() {
    try {
      await fetch(`/api/workspaces/${wsName}/kill`, { method: 'POST' });
    } catch {
      // Process may already be dead
    }
    processAlive = false;
    sending = false;
    streamingParts = [];
    activity.setBusy(false);
    await invalidateAll();
  }

  onDestroy(() => {
    eventSource?.close();
  });
</script>

<!-- Chat column -->
<div
  class={[
    'flex min-w-0 flex-1 flex-col border-l-2',
    executionMode === 'plan' ? 'border-l-amber-500/50' : 'border-l-transparent'
  ]}
>
  <!-- Header -->
  <WorkspaceHeader
    label={data.workspace.label}
    active={processAlive || sending}
    {executionMode}
    bind:verbose
    isMainWorkspace={data.workspace.isMainWorkspace}
    onmodechange={setMode}
  />

  <!-- Messages -->
  <div class="relative flex-1">
    <div bind:this={messagesEl} class="absolute inset-0 overflow-auto p-4 font-mono">
      <div class="flex min-h-full flex-col justify-end">
        {#if localMessages.length === 0 && !sending}
          <div class="flex h-full items-center justify-center">
            <p class="empty-state">Type a message to begin.</p>
          </div>
        {:else}
          <div class="space-y-6 leading-[1.8]">
            {#each localMessages as msg, i (i)}
              {#if msg.role === 'user'}
                <MessageUser
                  content={msg.content}
                  attachments={msg.attachments}
                  previewUrls={msg._previewUrls}
                  wsName={wsName}
                  askUserAnswers={msg.askUserAnswers}
                />
              {:else}
                <MessageAssistant
                  content={msg.content}
                  thinking={msg.thinking}
                  {verbose}
                  parts={msg.parts}
                  toolInvocations={msg.toolInvocations}
                />
              {/if}
            {/each}

            <!-- Streaming content -->
            {#if streamingParts.length > 0}
              <StreamingMessage
                {streamingParts}
                {verbose}
                textRevealed={textTypewriter.revealed}
                thinkingRevealed={thinkingTypewriter.revealed}
                {lastStreamingTextIndex}
                onenterplan={approveEnterPlan}
                onasksubmit={handleAskSubmit}
                oncustomanswer={handleCustomAnswer}
                onplanapproval={approvePlan}
              />
            {/if}
          </div>
        {/if}

        <!-- Activity indicator -->
        <div class="flex justify-center py-4">
          <div class="h-10 w-10 overflow-visible">
            <ServitorBit
              pulse={activity.pulseCount}
              busy={activity.busy}
              toolEmojiId={activity.toolEmojiId}
              toolEmoji={activity.toolEmoji}
              onclick={() => composerEl?.focus()}
            />
          </div>
        </div>
      </div>
    </div>

    {#if !stuckToBottom}
      <button
        onclick={() => {
          stuckToBottom = true;
          scrollToBottom();
        }}
        class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded border
					   border-zinc-700 bg-zinc-900/90 px-3 py-1 text-xs text-zinc-400
					   backdrop-blur-sm transition-colors hover:border-pink-500
					   hover:text-pink-400"
      >
        [scroll to bottom]
      </button>
    {/if}
  </div>

  <!-- Error -->
  {#if errorMessage}
    <div class="border-t border-red-900/50 px-3 py-2 text-xs text-red-400">
      <span class="text-red-600">[error]</span>
      {errorMessage}
      <button onclick={() => (errorMessage = '')} class="ml-2 text-red-600 hover:text-red-400"
        >dismiss</button
      >
    </div>
  {/if}

  <!-- Input -->
  <Composer
    {executionMode}
    {processAlive}
    onsend={sendMessage}
    onstop={stopProcess}
    bind:composerEl
  />
</div>
