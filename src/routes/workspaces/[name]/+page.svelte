<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import { onDestroy, tick } from 'svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import InfoPane from '$lib/components/InfoPane.svelte';
	import PaneResizer from '$lib/components/PaneResizer.svelte';
	import BrailleSpinner from '$lib/components/BrailleSpinner.svelte';
	import ServitorBit from '$lib/components/ServitorBit.svelte';

	import type { AskUserQuestion, ExecutionMode } from '$lib/server/agents/types';
	import { activity } from '$lib/stores/activity.svelte';

	let { data } = $props();

	let infoPaneWidth = $state(400);
	let input = $state('');
	let sending = $state(false);
	let processAlive = $state(false);
	let errorMessage = $state('');
	let executionMode: ExecutionMode = $state('build');

	// Sync execution mode from server data
	$effect(() => {
		executionMode = (data.executionMode as ExecutionMode) ?? 'build';
	});
	let messagesEl: HTMLDivElement | undefined = $state();
	let composerEl: HTMLTextAreaElement | undefined = $state();
	let eventSource: EventSource | null = null;

	// Typewriter: progressively reveal streamed text word by word
	let revealedText = $state('');
	let targetText = $state('');
	let revealTimer: ReturnType<typeof setInterval> | null = null;

	function startRevealing() {
		if (revealTimer) return;
		revealTimer = setInterval(() => {
			if (revealedText.length >= targetText.length) {
				if (revealTimer) clearInterval(revealTimer);
				revealTimer = null;
				return;
			}
			// Reveal next word (find next space or end)
			let next = targetText.indexOf(' ', revealedText.length);
			if (next === -1) next = targetText.length;
			else next++; // include the space
			revealedText = targetText.slice(0, next);
			activity.pulse();
		}, 20);
	}

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
		toolInvocations?: Array<{ tool: string; toolUseId: string; input: string }>;
		askUserAnswers?: { questions: AskUserQuestion[]; answers: Record<string, string> };
		ts: string;
	}> = $state([]);

	// Sync from server data when it changes
	$effect(() => {
		localMessages = [...data.messages];
	});

	// Feed streaming text into the typewriter
	$effect(() => {
		const textParts = streamingParts.filter((p) => p.type === 'text');
		const latest = textParts.length > 0 ? textParts[textParts.length - 1] : null;
		const newTarget = latest?.text ?? '';

		if (newTarget !== targetText) {
			targetText = newTarget;
			startRevealing();
		}

		// Reset when streaming clears
		if (streamingParts.length === 0) {
			targetText = '';
			revealedText = '';
			if (revealTimer) {
				clearInterval(revealTimer);
				revealTimer = null;
			}
		}
	});

	// Auto-scroll: observe DOM mutations in the messages container
	$effect(() => {
		if (!messagesEl) return;
		const el = messagesEl;

		// Scroll on mount / data refresh
		el.scrollTop = el.scrollHeight;

		const observer = new MutationObserver(() => {
			el.scrollTop = el.scrollHeight;
		});
		observer.observe(el, { childList: true, subtree: true, characterData: true });

		return () => observer.disconnect();
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
		sending = false;
		processAlive = false;
		activity.setBusy(false);

		const es = new EventSource(`/api/workspaces/${_ws}/stream`);

		es.addEventListener('connected', (e) => {
			const event = JSON.parse(e.data);
			processAlive = !!event.processing;

			// Restore pending interaction from server data if not actively processing
			if (!event.processing && data.pendingInteraction) {
				if (data.pendingInteraction.type === 'enter_plan') {
					streamingParts = [
						{ type: 'enter_plan', toolUseId: 'persisted', answered: false }
					];
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
			streamingParts = [...streamingParts, { type: 'text', text: event.text }];
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
			sending = false;
			processAlive = false;
			activity.setBusy(false);

			// Instantly finish the typewriter so there's no gap
			if (revealTimer) {
				clearInterval(revealTimer);
				revealTimer = null;
			}
			revealedText = targetText;

			// Load persisted messages first, THEN clear streaming parts.
			// This prevents a flash where neither streaming nor persisted text is visible.
			await invalidateAll();
			streamingParts = [];
		});

		es.addEventListener('done', async () => {
			sending = false;
			processAlive = false;
			activity.setBusy(false);

			// Instantly finish the typewriter
			if (revealTimer) {
				clearInterval(revealTimer);
				revealTimer = null;
			}
			revealedText = targetText;

			// Preserve streaming parts if there's a pending interaction
			const hasPendingInteraction = streamingParts.some(
				(p) =>
					(p.type === 'enter_plan' || p.type === 'ask_user' || p.type === 'exit_plan') &&
					!p.answered
			);

			await invalidateAll();
			if (!hasPendingInteraction) {
				streamingParts = [];
			}
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

	async function sendMessage() {
		if (!input.trim()) return;

		const content = input.trim();
		input = '';
		sending = true;
		activity.setBusy(true);
		errorMessage = '';

		localMessages = [...localMessages, { role: 'user', content, ts: new Date().toISOString() }];

		try {
			const res = await fetch(`/api/workspaces/${wsName}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Failed to send message' }));
				errorMessage = err.message ?? 'Failed to send message';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Network error';
		}
	}

	// Pending answers: toolUseId -> { questionText -> "label" or "label1, label2" }
	let pendingAnswers: Record<string, Record<string, string>> = $state({});

	// Custom freeform answer text per toolUseId
	let customAnswer: Record<string, string> = $state({});

	// Preview state for markdown option previews: toolUseId -> { questionText -> hoveredLabel }
	let previewOption: Record<string, Record<string, string>> = $state({});

	/** Check whether a label is among the selected answers (works for both single/multi-select) */
	function isOptionPending(toolUseId: string, questionText: string, label: string): boolean {
		const answer = pendingAnswers[toolUseId]?.[questionText] ?? '';
		return answer
			.split(', ')
			.filter(Boolean)
			.includes(label);
	}

	/** Check whether a label was selected in a persisted answer */
	function wasOptionSelected(
		answers: Record<string, string>,
		questionText: string,
		label: string
	): boolean {
		const answer = answers[questionText] ?? '';
		return answer
			.split(', ')
			.filter(Boolean)
			.includes(label);
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
			// Toggle: add/remove from comma-separated list
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
			// Single select
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

	/** Whether a set of questions needs a submit button (multi-question or any multiSelect) */
	function needsSubmitButton(questions: AskUserQuestion[]): boolean {
		return questions.length > 1 || questions.some((q) => q.multiSelect);
	}

	async function submitAnswers(toolUseId: string, questions: AskUserQuestion[]) {
		const answers = pendingAnswers[toolUseId] ?? {};
		const content = formatAnswer(questions, answers);
		if (!content) return;

		// Clear streaming parts — the persisted message will carry the rich UI
		streamingParts = [];
		delete pendingAnswers[toolUseId];
		delete previewOption[toolUseId];

		// Build the structured data for persistence
		const askUserAnswers = { questions, answers };

		// Add as a local message immediately
		sending = true;
		activity.setBusy(true);
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

	async function submitCustomAnswer(toolUseId: string) {
		const content = customAnswer[toolUseId]?.trim();
		if (!content) return;

		streamingParts = [];
		delete customAnswer[toolUseId];
		delete pendingAnswers[toolUseId];
		delete previewOption[toolUseId];

		sending = true;
		activity.setBusy(true);
		localMessages = [
			...localMessages,
			{ role: 'user', content, ts: new Date().toISOString() }
		];

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

		const content = approved
			? 'Yes, please plan first.'
			: 'No, just proceed with implementation.';

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
		await invalidateAll();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
		if (e.key === 'Escape' && processAlive) {
			e.preventDefault();
			stopProcess();
		}
	}

	onDestroy(() => {
		eventSource?.close();
	});
</script>

<!-- Shared snippet for rendering a question's options (used in both streaming and persisted views) -->
{#snippet questionOptions(q: AskUserQuestion, toolUseId: string, allQuestions: AskUserQuestion[], interactive: boolean)}
	{@const hasMarkdown = q.options.some((o) => o.markdown)}

	{#if hasMarkdown && interactive}
		<!-- Side-by-side: option list + markdown preview -->
		<div class="flex gap-4">
			<div class="flex w-1/3 flex-col gap-1.5">
				{#each q.options as option}
					{@const selected = isOptionPending(toolUseId, q.question, option.label)}
					<button
						onmouseenter={() => focusPreview(toolUseId, q.question, option.label)}
						onclick={() => selectOption(toolUseId, q, option.label, allQuestions)}
						class="rounded border px-3 py-1.5 text-left text-sm transition-colors {selected
							? 'border-pink-500 bg-pink-500/20 text-pink-400'
							: 'border-zinc-600 text-zinc-300 hover:border-pink-500 hover:text-pink-400'}"
					>
						<div>{option.label}</div>
						{#if option.description}
							<div class="text-xs text-zinc-500">{option.description}</div>
						{/if}
					</button>
				{/each}
			</div>
			<div
				class="flex-1 overflow-auto rounded border border-zinc-700 bg-zinc-900/50 p-3"
			>
				{#if q.options.find((o) => o.label === previewOption[toolUseId]?.[q.question])?.markdown}
					<pre class="whitespace-pre-wrap font-mono text-xs text-zinc-400">{q.options.find((o) => o.label === previewOption[toolUseId]?.[q.question])?.markdown}</pre>
				{:else}
					<span class="text-xs text-zinc-600">Hover an option to preview</span>
				{/if}
			</div>
		</div>
	{:else if interactive}
		<!-- Horizontal buttons (no markdown) -->
		<div class="flex flex-wrap gap-2">
			{#each q.options as option}
				{@const selected = isOptionPending(toolUseId, q.question, option.label)}
				<button
					onclick={() => selectOption(toolUseId, q, option.label, allQuestions)}
					class="rounded border px-3 py-1.5 text-sm transition-colors {selected
						? 'border-pink-500 bg-pink-500/20 text-pink-400'
						: 'border-zinc-600 text-zinc-300 hover:border-pink-500 hover:text-pink-400'}"
					title={option.description}
				>
					{option.label}
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet questionOptionsReadonly(q: AskUserQuestion, answers: Record<string, string>)}
	<div class="flex flex-wrap gap-2">
		{#each q.options as option}
			{@const selected = wasOptionSelected(answers, q.question, option.label)}
			<span
				class="rounded border px-3 py-1.5 text-sm {selected
					? 'border-pink-500 bg-pink-500/20 text-pink-400'
					: 'border-zinc-800 text-zinc-700'}"
			>
				{option.label}
			</span>
		{/each}
	</div>
{/snippet}

<div class="flex h-full">
	<!-- Chat column -->
	<div
		class="flex min-w-0 flex-1 flex-col border-l-2 pl-3 pr-3 font-mono {executionMode === 'plan'
			? 'border-l-amber-500/50'
			: 'border-l-transparent'}"
	>
		<!-- Header -->
		<div
			class="flex items-center justify-between pb-3 {executionMode === 'plan'
				? 'border-b border-amber-500/30'
				: 'border-b border-zinc-800'}"
		>
			<div class="flex items-center gap-2 text-sm">
				<span class="text-zinc-200">{data.workspace.name}</span>
				{#if processAlive || sending}
					<span class="inline-block h-2 w-2 rounded-full bg-green-500"></span>
				{:else}
					<span class="inline-block h-2 w-2 rounded-full bg-zinc-700"></span>
				{/if}
			</div>
			<div class="flex items-center gap-3">
				<!-- Execution mode selector -->
				<div class="flex gap-1 text-xs">
					{#each ['plan', 'build'] as mode}
						<button
							onclick={() => setMode(mode as ExecutionMode)}
							class="rounded px-2 py-0.5 transition-colors {executionMode === mode
								? mode === 'plan'
									? 'bg-amber-500/20 text-amber-400'
									: 'bg-green-500/20 text-green-400'
								: 'text-zinc-600 hover:text-zinc-400'}"
						>
							{mode}
						</button>
					{/each}
				</div>
				<form method="POST" action="?/delete" use:enhance>
					<button
						type="submit"
						onclick={(e: MouseEvent) => {
							if (!confirm('Delete this workspace and its worktree?')) e.preventDefault();
						}}
						class="text-xs text-zinc-600 transition-colors hover:text-red-400"
					>
						[delete]
					</button>
				</form>
			</div>
		</div>

		<!-- Messages -->
		<div bind:this={messagesEl} class="flex-1 overflow-auto py-3">
			<div class="flex min-h-full flex-col justify-end">
			{#if localMessages.length === 0 && !sending}
				<div class="flex h-full items-center justify-center">
					<p class="text-sm text-zinc-600">Type a message to begin.</p>
				</div>
			{:else}
				<div class="space-y-6 leading-[1.8]">
					{#each localMessages as msg, i (i)}
						<div class="group">
							{#if msg.role === 'user' && msg.askUserAnswers}
								<!-- Persisted answer with rich UI -->
								<div class="rounded border border-zinc-700 p-4">
									{#each msg.askUserAnswers.questions as q}
										<div class="mb-4 last:mb-0">
											<div class="mb-1 text-xs uppercase tracking-wide text-amber-600">
												{q.header}
											</div>
											<div class="mb-3 text-sm text-zinc-200">{q.question}</div>
											{@render questionOptionsReadonly(q, msg.askUserAnswers?.answers ?? {})}
										</div>
									{/each}
								</div>
							{:else if msg.role === 'user'}
								<div
									class="inline-block whitespace-pre-wrap rounded bg-pink-500/50 px-2 py-0.5 text-sm text-white"
								>
									{msg.content}
								</div>
							{:else}
								<div class="text-sm text-zinc-300">
									<Markdown content={msg.content} />
								</div>
							{/if}
						</div>
					{/each}

					<!-- Streaming content -->
					{#if streamingParts.length > 0}
						{@const textParts = streamingParts.filter((p) => p.type === 'text')}
						{@const latestText = textParts.length > 0 ? textParts[textParts.length - 1] : null}
						{@const thinkingParts = streamingParts.filter((p) => p.type === 'thinking')}
						{@const latestThinking = thinkingParts.length > 0 ? thinkingParts[thinkingParts.length - 1] : null}
						<div class="space-y-3">
							{#if latestThinking}
								<details class="text-sm">
									<summary
										class="cursor-pointer text-amber-700 hover:text-amber-600"
										>[thinking]</summary
									>
									<div class="mt-1 whitespace-pre-wrap pl-3 text-xs text-zinc-600">
										{latestThinking.text}
									</div>
								</details>
							{/if}
							{#each streamingParts as part, i (i)}
								{#if part.type === 'enter_plan'}
									<div class="my-3 rounded border border-amber-700/50 bg-amber-500/5 p-4">
										<div class="mb-2 text-xs uppercase tracking-wide text-amber-600">
											Enter Plan Mode
										</div>
										<div class="mb-3 text-sm text-zinc-300">
											The agent wants to plan before implementing. Switch to plan mode?
										</div>
										{#if !part.answered}
											<div class="flex gap-2">
												<button
													onclick={() => approveEnterPlan(true)}
													class="rounded border border-amber-600 px-4 py-1.5 text-sm text-amber-400 transition-colors hover:bg-amber-500/20"
												>
													[plan first]
												</button>
												<button
													onclick={() => approveEnterPlan(false)}
													class="rounded border border-zinc-600 px-4 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-500/20"
												>
													[just build]
												</button>
											</div>
										{/if}
									</div>
								{:else if part.type === 'ask_user'}
									<div class="my-3 rounded border border-zinc-700 p-4">
										{#each part.questions as q}
											<div class="mb-4 last:mb-0">
												<div class="mb-1 text-xs uppercase tracking-wide text-amber-600">
													{q.header}
												</div>
												<div class="mb-3 text-sm text-zinc-200">{q.question}</div>
												{#if part.answered}
													{@render questionOptionsReadonly(q, part.submittedAnswers ?? {})}
												{:else}
													{@render questionOptions(q, part.toolUseId, part.questions, true)}
												{/if}
											</div>
										{/each}
										{#if !part.answered && needsSubmitButton(part.questions)}
											{@const answeredCount = Object.keys(
												pendingAnswers[part.toolUseId] ?? {}
											).filter((k) => pendingAnswers[part.toolUseId][k]).length}
											<div
												class="mt-4 flex items-center gap-3 border-t border-zinc-700/50 pt-3"
											>
												<button
													onclick={() =>
														submitAnswers(part.toolUseId, part.questions)}
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
													class="pb-0.5 text-xs text-zinc-600 transition-colors hover:text-zinc-300 disabled:opacity-20"
												>
													[reply]
												</button>
											</div>
										{/if}
									</div>
								{:else if part.type === 'exit_plan'}
									<div class="my-3 rounded border border-zinc-700 p-4">
										<div class="mb-2 flex items-center gap-3 text-xs uppercase tracking-wide text-amber-600">
											<span>Plan Approval</span>
											{#if part.planFilePath}
												<span class="normal-case tracking-normal text-zinc-600">{part.planFilePath}</span>
											{/if}
										</div>
										{#if part.planContent}
											<details open={!part.answered}>
												<summary class="mb-2 cursor-pointer text-xs text-zinc-500 hover:text-zinc-400">
													{part.answered ? 'Show plan' : 'Plan details'}
												</summary>
												<div class="mb-4 max-h-[60vh] overflow-auto rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300">
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
													onclick={() => approvePlan(true)}
													class="rounded border border-green-600 px-4 py-1.5 text-sm text-green-400 transition-colors hover:bg-green-500/20"
												>
													[approve]
												</button>
												<button
													onclick={() => approvePlan(false)}
													class="rounded border border-red-600 px-4 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/20"
												>
													[reject]
												</button>
											</div>
										{/if}
									</div>
								{/if}
							{/each}
							{#if revealedText}
								<div class="text-sm text-zinc-300">
									<Markdown content={revealedText} />
								</div>
							{/if}
							{#if !streamingParts.some((p) => (p.type === 'enter_plan' || p.type === 'ask_user' || p.type === 'exit_plan') && !p.answered)}
								<div class="pl-3">
									<BrailleSpinner />
								</div>
							{/if}
						</div>
					{:else if sending}
						<div class="pl-3">
							<BrailleSpinner />
						</div>
					{/if}
				</div>
			{/if}
			</div>
		</div>

		<!-- Error -->
		{#if errorMessage}
			<div class="border-t border-red-900/50 px-3 py-2 text-xs text-red-400">
				<span class="text-red-600">[error]</span>
				{errorMessage}
				<button
					onclick={() => (errorMessage = '')}
					class="ml-2 text-red-600 hover:text-red-400">dismiss</button
				>
			</div>
		{/if}

		<!-- Input -->
		<div
			class="pt-3 {executionMode === 'plan'
				? 'border-t border-amber-500/30'
				: 'border-t border-zinc-800'}"
		>
			<div class="flex items-center gap-2">
				<div class="h-14 w-14 shrink-0 overflow-visible">
					<ServitorBit pulse={activity.pulseCount} busy={activity.busy} toolEmojiId={activity.toolEmojiId} toolEmoji={activity.toolEmoji} onclick={() => composerEl?.focus()} />
				</div>
				<textarea
					bind:this={composerEl}
					bind:value={input}
					onkeydown={handleKeydown}
					placeholder=""
					rows="1"
					class="flex-1 resize-none bg-transparent py-1.5 text-sm text-pink-400 placeholder-zinc-700 focus:outline-none"
				></textarea>
				{#if processAlive}
					<button
						onclick={stopProcess}
						class="text-xs text-red-600 transition-colors hover:text-red-400"
					>
						[stop]
					</button>
				{:else}
					<button
						onclick={sendMessage}
						disabled={!input.trim()}
						class="text-xs text-zinc-600 transition-colors hover:text-zinc-300 disabled:opacity-20"
					>
						[send]
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Resizer + Info pane -->
	<PaneResizer bind:width={infoPaneWidth} min={250} max={700} side="right" storageKey="pane:info" />
	<div class="hidden shrink-0 overflow-auto pl-3 lg:block" style:width="{infoPaneWidth}px">
		<InfoPane
			commits={data.commits}
			committedDiff={data.committedDiff}
			committedStatus={data.committedStatus}
			uncommittedDiff={data.uncommittedDiff}
			uncommittedStatus={data.uncommittedStatus}
		/>
	</div>
</div>
