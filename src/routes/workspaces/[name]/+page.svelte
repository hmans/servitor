<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate, invalidateAll } from '$app/navigation';
  import { onDestroy, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import Composer from '$lib/components/Composer.svelte';
  import MessageAssistant from '$lib/components/MessageAssistant.svelte';
  import MessageUser from '$lib/components/MessageUser.svelte';
  import ServitorBit from '$lib/components/ServitorBit.svelte';
  import StreamingMessage from '$lib/components/StreamingMessage.svelte';
  import WorkspaceHeader from '$lib/components/WorkspaceHeader.svelte';

  import type { AskUserQuestion, ExecutionMode } from '$lib/server/agents/types';
  import type { Attachment, MessagePart } from '$lib/server/conversations';
  import { formatAnswer, type StreamingPart } from '$lib/types/streaming';
  import { activity } from '$lib/stores/activity.svelte';

  let { data } = $props();

  // Agent lifecycle: idle → sending → streaming → idle
  type AgentState = 'idle' | 'sending' | 'streaming';
  let agentState: AgentState = $state('idle');
  const active = $derived(agentState !== 'idle');

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

  // Streaming state — built up as SSE events arrive
  let streamingParts: StreamingPart[] = $state([]);

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
    localMessages = data.messages;
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

  // SSE lifecycle
  $effect(() => {
    // Touch wsName so the effect re-runs when navigating between workspaces
    const _ws = wsName;

    streamingParts = [];
    agentState = 'idle';
    activity.setBusy(false);

    const es = new EventSource(`/api/workspaces/${_ws}/stream`);

    // Track whether message_complete already fired this turn, so the
    // done handler can skip a redundant invalidateAll().
    let turnCompleted = false;

    /** Subscribe to an SSE event with debug logging and JSON parsing. */
    function listenSSE<T = Record<string, unknown>>(type: string, handler: (data: T) => void) {
      es.addEventListener(type, (e) => {
        const me = e as MessageEvent;
        let parsed: T | undefined;
        try {
          parsed = me.data ? JSON.parse(me.data) : undefined;
        } catch {
          // not JSON
        }
        console.debug(`[SSE] ${type}`, parsed ?? me.data ?? '(no data)');
        handler(parsed as T);
      });
    }

    listenSSE<{ processing: boolean }>('connected', (event) => {

      // If agent is mid-turn, show busy state immediately
      if (event.processing) {
        agentState = 'streaming';
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

    listenSSE<{ text: string }>('thinking', (event) => {
      agentState = 'streaming';
      activity.setBusy(true);
      activity.pulse();
      // Consolidate: update last thinking part if exists, otherwise add new
      const lastPart = streamingParts[streamingParts.length - 1];
      if (lastPart?.type === 'thinking') {
        lastPart.text = event.text;
      } else {
        streamingParts.push({ type: 'thinking', text: event.text });
      }
    });

    listenSSE<{ text: string }>('text_delta', (event) => {
      agentState = 'streaming';
      activity.setBusy(true);
      activity.pulse();
      // Consolidate: update last text part if exists, otherwise add new
      const lastPart = streamingParts[streamingParts.length - 1];
      if (lastPart?.type === 'text') {
        lastPart.text = event.text;
      } else {
        streamingParts.push({ type: 'text', text: event.text });
      }
    });

    listenSSE<{ tool: string; input?: string; toolUseId: string }>('tool_use_start', (event) => {
      agentState = 'streaming';
      activity.setBusy(true);
      activity.pulse();
      activity.emitToolEmoji(event.tool);
      streamingParts.push({
        type: 'tool_use',
        tool: event.tool,
        input: event.input ?? '',
        toolUseId: event.toolUseId
      });
    });

    listenSSE<{ toolUseId: string }>('enter_plan', (event) => {
      agentState = 'idle';
      streamingParts.push({ type: 'enter_plan', toolUseId: event.toolUseId, answered: false });
    });

    listenSSE<{ toolUseId: string; questions: AskUserQuestion[] }>('ask_user', (event) => {
      // Process will be killed by the server
      agentState = 'idle';
      streamingParts.push({
        type: 'ask_user',
        toolUseId: event.toolUseId,
        questions: event.questions,
        answered: false
      });
    });

    listenSSE<{
      toolUseId: string;
      allowedPrompts?: Array<{ tool: string; prompt: string }>;
      planContent?: string;
      planFilePath?: string;
    }>('exit_plan', (event) => {
      // Process will be killed by the server
      agentState = 'idle';
      streamingParts.push({
        type: 'exit_plan',
        toolUseId: event.toolUseId,
        allowedPrompts: event.allowedPrompts,
        planContent: event.planContent,
        planFilePath: event.planFilePath,
        answered: false
      });
    });

    listenSSE<{ text: string }>('message_complete', async (event) => {
      turnCompleted = true;
      agentState = 'idle';
      activity.setBusy(false);

      // Promote streaming content to a persisted message synchronously.
      // This avoids the flash caused by async invalidateAll() replacing the view.
      let thinking = '';
      const toolInvocations: Array<{ tool: string; toolUseId: string; input: string }> = [];
      const parts: MessagePart[] = [];
      for (const p of streamingParts) {
        if (p.type === 'thinking') thinking = p.text;
        else if (p.type === 'text') parts.push({ type: 'text', text: p.text });
        else if (p.type === 'tool_use') {
          toolInvocations.push({ tool: p.tool, toolUseId: p.toolUseId, input: p.input });
          parts.push({ type: 'tool_use', tool: p.tool, toolUseId: p.toolUseId, input: p.input });
        }
      }

      streamingParts = [];
      localMessages.push({
        role: 'assistant',
        content: event.text,
        thinking: thinking || undefined,
        toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
        parts: parts.length > 0 ? parts : undefined,
        ts: new Date().toISOString()
      });

      stuckToBottom = true;
      await tick();
      scrollToBottom();
    });

    listenSSE('done', async () => {
      agentState = 'idle';
      activity.setBusy(false);

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

    listenSSE('worktree_changed', async () => {
      if (document.visibilityState === 'visible') {
        await invalidateAll();
      }
    });

    // Error uses raw addEventListener since EventSource error events aren't JSON MessageEvents
    es.addEventListener('error', (e) => {
      try {
        const event = JSON.parse((e as MessageEvent).data);
        if (event.message) errorMessage = event.message;
      } catch {
        // Native EventSource error (connection lost, etc.)
      }
      agentState = 'idle';
      activity.setBusy(false);
      streamingParts = [];
    });

    eventSource = es;

    // Catch up on missed worktree changes when tab becomes visible
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        invalidateAll();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      es.close();
      eventSource = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  /**
   * Post a user message to the workspace. Handles optimistic local rendering,
   * the fetch to the messages endpoint, and error handling.
   */
  async function postMessage(
    content: string,
    opts?: {
      /** Extra fields merged into the optimistic local message */
      localExtra?: Record<string, unknown>;
      /** Extra fields merged into the POST body */
      bodyExtra?: Record<string, unknown>;
    }
  ) {
    agentState = 'sending';
    activity.setBusy(true);
    errorMessage = '';
    stuckToBottom = true;

    localMessages.push({ role: 'user', content, ts: new Date().toISOString(), ...opts?.localExtra });

    try {
      const res = await fetch(`/api/workspaces/${wsName}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, ...opts?.bodyExtra })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to send' }));
        errorMessage = err.message ?? 'Failed to send';
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Network error';
    }
  }

  async function sendMessage(
    content: string,
    attachments?: Array<{ filename: string; mediaType: string; data: string }>
  ) {
    const attachmentsMeta = attachments?.map((a) => ({
      id: '',
      filename: a.filename,
      mediaType: a.mediaType,
      path: ''
    }));

    await postMessage(content, {
      localExtra: attachmentsMeta ? { attachments: attachmentsMeta } : undefined,
      bodyExtra: attachments ? { attachments } : undefined
    });
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
    await postMessage(content, {
      localExtra: { askUserAnswers },
      bodyExtra: { askUserAnswers }
    });
  }

  async function handleCustomAnswer(_toolUseId: string, content: string) {
    streamingParts = [];
    await postMessage(content);
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
        agentState = 'idle';
      }
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to change mode';
    }
  }

  async function approveEnterPlan(approved: boolean) {
    streamingParts = [];
    if (approved) await setMode('plan');
    await postMessage(
      approved ? 'Yes, please plan first.' : 'No, just proceed with implementation.'
    );
  }

  async function approvePlan(approved: boolean) {
    streamingParts = [];
    if (approved && executionMode === 'plan') await setMode('build');
    await postMessage(
      approved
        ? 'Plan approved. Proceed with the implementation.'
        : 'Plan rejected. Please revise the plan.'
    );
  }

  async function stopProcess() {
    try {
      await fetch(`/api/workspaces/${wsName}/kill`, { method: 'POST' });
    } catch {
      // Process may already be dead
    }
    agentState = 'idle';
    streamingParts = [];
    activity.setBusy(false);

    // Optimistically show the stop message (server persists it too)
    localMessages.push({ role: 'system', content: 'Stopped by user', ts: new Date().toISOString() });

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
    {active}
    {executionMode}
    bind:verbose
    isMainWorkspace={data.workspace.isMainWorkspace}
    onmodechange={setMode}
  />

  <!-- Messages -->
  <div class="relative flex-1">
    <div bind:this={messagesEl} class="absolute inset-0 overflow-auto px-4 pt-4 pb-0 font-mono">
      <div class="flex min-h-full flex-col justify-end">
        {#if localMessages.length === 0 && !active}
          <div class="flex h-full items-center justify-center">
            <p class="empty-state">Type a message to begin.</p>
          </div>
        {:else}
          <div class="space-y-6 leading-[1.8]">
            {#each localMessages as msg (msg.ts)}
              <div transition:fade={{ duration: 150 }}>
                {#if msg.role === 'system'}
                  <div class="flex items-start gap-3">
                    <span
                      class={[
                        'mt-0.5 shrink-0 text-fg-faint',
                        msg.content === 'Stopped by user'
                          ? 'icon-[mdi--stop]'
                          : 'icon-[uil--square-full]'
                      ]}
                    ></span>
                    <span class="text-sm text-fg-faint">{msg.content}</span>
                  </div>
                {:else if msg.role === 'user'}
                  <MessageUser
                    content={msg.content}
                    attachments={msg.attachments}
                    previewUrls={msg._previewUrls}
                    {wsName}
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
              </div>
            {/each}

            <!-- Streaming content -->
            {#if streamingParts.length > 0}
              <div transition:fade={{ duration: 150 }}>
                <StreamingMessage
                  {streamingParts}
                  {verbose}
                  onenterplan={approveEnterPlan}
                  onasksubmit={handleAskSubmit}
                  oncustomanswer={handleCustomAnswer}
                  onplanapproval={approvePlan}
                />
              </div>
            {/if}
          </div>
        {/if}

        <!-- Activity indicator -->
        <ServitorBit
          pulse={activity.pulseCount}
          busy={activity.busy}
          toolEmojiId={activity.toolEmojiId}
          toolEmoji={activity.toolEmoji}
          onclick={() => composerEl?.focus()}
        />
      </div>
    </div>

    {#if !stuckToBottom}
      <button
        onclick={() => {
          stuckToBottom = true;
          scrollToBottom();
        }}
        class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded border
					   border-edge-muted bg-surface-alt/90 px-3 py-1 text-xs text-fg-muted
					   backdrop-blur-sm transition-colors hover:border-pink-500
					   hover:text-pink-400"
      >
        [scroll to bottom]
      </button>
    {/if}
  </div>

  <!-- Error -->
  {#if errorMessage}
    <div class="border-t border-error-border px-3 py-2 text-xs text-red-400">
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
    {active}
    onsend={sendMessage}
    onstop={stopProcess}
    bind:composerEl
  />
</div>
