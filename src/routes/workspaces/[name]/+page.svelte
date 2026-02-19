<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import { onDestroy, tick } from 'svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import InfoPane from '$lib/components/InfoPane.svelte';
	import PaneResizer from '$lib/components/PaneResizer.svelte';
	import BrailleSpinner from '$lib/components/BrailleSpinner.svelte';

	import type { AskUserQuestion } from '$lib/server/agents/types';

	let { data } = $props();

	let infoPaneWidth = $state(400);
	let input = $state('');
	let sending = $state(false);
	let processAlive = $state(false);
	let errorMessage = $state('');
	let messagesEl: HTMLDivElement | undefined = $state();
	let composerEl: HTMLTextAreaElement | undefined = $state();
	let eventSource: EventSource | null = null;

	// Streaming state — built up as SSE events arrive
	let streamingParts: Array<
		| { type: 'text'; text: string }
		| { type: 'tool_use'; tool: string; input: string; toolUseId: string }
		| { type: 'ask_user'; toolUseId: string; questions: AskUserQuestion[]; answered: boolean; submittedAnswers?: Record<string, string> }
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
		scrollToBottom();
	});

	// Focus composer on every navigation
	afterNavigate(() => {
		tick().then(() => composerEl?.focus());
	});

	function scrollToBottom() {
		tick().then(() => {
			if (messagesEl) {
				messagesEl.scrollTop = messagesEl.scrollHeight;
			}
		});
	}

	const wsName = $derived(data.workspace.name);

	// SSE lifecycle
	$effect(() => {
		// Touch wsName so the effect re-runs when navigating between workspaces
		const _ws = wsName;

		streamingParts = [];
		sending = false;
		processAlive = false;

		const es = new EventSource(`/api/workspaces/${_ws}/stream`);

		es.addEventListener('connected', (e) => {
			const event = JSON.parse(e.data);
			console.log('[claude] connected', event);
			processAlive = !!event.processing;
		});

		es.addEventListener('text_delta', (e) => {
			const event = JSON.parse(e.data);
			console.log('[claude] text_delta', event);
			processAlive = true;
			sending = false;
			streamingParts = [...streamingParts, { type: 'text', text: event.text }];
			scrollToBottom();
		});

		es.addEventListener('tool_use_start', (e) => {
			const event = JSON.parse(e.data);
			console.log('[claude] tool_use_start', event);
			processAlive = true;
			sending = false;
			streamingParts = [
				...streamingParts,
				{ type: 'tool_use', tool: event.tool, input: event.input ?? '', toolUseId: event.toolUseId }
			];
			scrollToBottom();
		});

		es.addEventListener('ask_user', (e) => {
			const event = JSON.parse(e.data);
			console.log('[claude] ask_user', event);
			// Process will be killed by the server — don't set processAlive
			sending = false;
			streamingParts = [
				...streamingParts,
				{ type: 'ask_user', toolUseId: event.toolUseId, questions: event.questions, answered: false }
			];
			scrollToBottom();
		});

		es.addEventListener('message_complete', async () => {
			console.log('[claude] message_complete');
			sending = false;
			processAlive = false;
			streamingParts = [];
			await invalidateAll();
			scrollToBottom();
		});

		es.addEventListener('done', async () => {
			console.log('[claude] done (process exited)');
			sending = false;
			processAlive = false;
			// Preserve streaming parts if there's an unanswered question
			const hasUnansweredQuestion = streamingParts.some(
				(p) => p.type === 'ask_user' && !p.answered
			);
			if (!hasUnansweredQuestion) {
				streamingParts = [];
			}
			await invalidateAll();
			scrollToBottom();
		});

		es.addEventListener('error', (e) => {
			try {
				const event = JSON.parse((e as MessageEvent).data);
				console.log('[claude] error', event);
				if (event.message) errorMessage = event.message;
			} catch {
				// Native EventSource error
				console.log('[claude] connection error', e);
			}
			sending = false;
			processAlive = false;
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
		errorMessage = '';

		localMessages = [
			...localMessages,
			{ role: 'user', content, ts: new Date().toISOString() }
		];
		scrollToBottom();

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

	// Pending answers for multi-question forms: toolUseId -> { questionText -> selectedLabel }
	let pendingAnswers: Record<string, Record<string, string>> = $state({});

	function selectOption(toolUseId: string, questionText: string, label: string, questions: AskUserQuestion[]) {
		if (!pendingAnswers[toolUseId]) {
			pendingAnswers[toolUseId] = {};
		}
		pendingAnswers[toolUseId][questionText] = label;

		// For single-question invocations, submit immediately on click
		if (questions.length === 1) {
			submitAnswers(toolUseId, questions);
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

	async function submitAnswers(toolUseId: string, questions: AskUserQuestion[]) {
		const answers = pendingAnswers[toolUseId] ?? {};
		const content = formatAnswer(questions, answers);
		if (!content) return;

		// Clear streaming parts — the persisted message will carry the rich UI
		streamingParts = [];
		delete pendingAnswers[toolUseId];

		// Build the structured data for persistence
		const askUserAnswers = { questions, answers };

		// Add as a local message immediately
		sending = true;
		localMessages = [
			...localMessages,
			{ role: 'user', content, askUserAnswers, ts: new Date().toISOString() }
		];
		scrollToBottom();

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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	onDestroy(() => {
		eventSource?.close();
	});
</script>

<div class="flex h-full">
<!-- Chat column -->
<div class="flex min-w-0 flex-1 flex-col pr-3 font-mono">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-zinc-800 pb-3">
		<div class="flex items-center gap-2 text-sm">
			<span class="text-zinc-200">{data.workspace.name}</span>
			{#if processAlive || sending}
				<span class="inline-block h-2 w-2 rounded-full bg-green-500"></span>
			{:else}
				<span class="inline-block h-2 w-2 rounded-full bg-zinc-700"></span>
			{/if}
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

	<!-- Messages -->
	<div bind:this={messagesEl} class="flex-1 overflow-auto py-3">
		{#if localMessages.length === 0 && !sending}
			<div class="flex h-full items-center justify-center">
				<p class="text-sm text-zinc-600">Type a message to begin.</p>
			</div>
		{:else}
			<div class="space-y-6 leading-[1.8]">
				{#each localMessages as msg, i (i)}
					<div class="group">
						{#if msg.role === 'user' && msg.askUserAnswers}
							<div class="border border-zinc-700 rounded p-4">
								{#each msg.askUserAnswers.questions as q}
									<div class="mb-4 last:mb-0">
										<div class="text-xs text-amber-600 uppercase tracking-wide mb-1">{q.header}</div>
										<div class="text-sm text-zinc-200 mb-3">{q.question}</div>
										<div class="flex flex-wrap gap-2">
											{#each q.options as option}
												{@const wasSelected = msg.askUserAnswers?.answers[q.question] === option.label}
												<span
													class="rounded border px-3 py-1.5 text-sm {wasSelected
														? 'border-pink-500 bg-pink-500/20 text-pink-400'
														: 'border-zinc-800 text-zinc-700'}"
												>
													{option.label}
												</span>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{:else if msg.role === 'user'}
							<div class="inline-block whitespace-pre-wrap rounded bg-pink-500/50 px-2 py-0.5 text-sm text-white">{msg.content}</div>
						{:else}
							{#if msg.toolInvocations}
								<div class="space-y-1 py-1">
									{#each msg.toolInvocations as t (t.toolUseId)}
										<div class="flex items-center gap-2 pl-3 text-sm text-zinc-600">
											<span class="text-amber-600">[tool]</span>
											<span class="text-zinc-500">{t.tool}</span>
											{#if t.input}
												<span class="truncate text-zinc-700">{t.input}</span>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
							<div class="text-sm text-zinc-100">
								<Markdown content={msg.content} />
							</div>
						{/if}
					</div>
				{/each}

				<!-- Streaming content -->
				{#if streamingParts.length > 0}
					<div class="space-y-3">
						{#each streamingParts as part, i (i)}
							{#if part.type === 'text'}
								<div class="text-sm text-zinc-100">
									<Markdown content={part.text} />
								</div>
							{:else if part.type === 'tool_use'}
								<div class="flex items-center gap-2 pl-3 text-sm text-zinc-600">
									<span class="text-amber-600">[tool]</span>
									<span class="text-zinc-500">{part.tool}</span>
									{#if part.input}
										<span class="truncate text-zinc-700">{part.input}</span>
									{/if}
								</div>
							{:else if part.type === 'ask_user'}
								<div class="my-3 border border-zinc-700 rounded p-4">
									{#each part.questions as q}
										<div class="mb-4 last:mb-0">
											<div class="text-xs text-amber-600 uppercase tracking-wide mb-1">{q.header}</div>
											<div class="text-sm text-zinc-200 mb-3">{q.question}</div>
											{#if part.answered}
												<div class="flex flex-wrap gap-2">
													{#each q.options as option}
														{@const wasSelected = part.submittedAnswers?.[q.question] === option.label}
														<span
															class="rounded border px-3 py-1.5 text-sm {wasSelected
																? 'border-pink-500 bg-pink-500/20 text-pink-400'
																: 'border-zinc-800 text-zinc-700'}"
														>
															{option.label}
														</span>
													{/each}
												</div>
											{:else}
												<div class="flex flex-wrap gap-2">
													{#each q.options as option}
														{@const selected = pendingAnswers[part.toolUseId]?.[q.question] === option.label}
														<button
															onclick={() =>
																selectOption(part.toolUseId, q.question, option.label, part.questions)}
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
										</div>
									{/each}
									{#if !part.answered && part.questions.length > 1}
										{@const answeredCount = Object.keys(pendingAnswers[part.toolUseId] ?? {}).length}
										<div class="mt-4 flex items-center gap-3 border-t border-zinc-700/50 pt-3">
											<button
												onclick={() => submitAnswers(part.toolUseId, part.questions)}
												disabled={answeredCount === 0}
												class="rounded border border-pink-600 px-4 py-1.5 text-sm text-pink-400 transition-colors hover:bg-pink-500/20 disabled:opacity-30 disabled:cursor-not-allowed"
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
								</div>
							{/if}
						{/each}
						{#if !streamingParts.some((p) => p.type === 'ask_user' && !p.answered)}
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

	<!-- Error -->
	{#if errorMessage}
		<div class="border-t border-red-900/50 px-3 py-2 text-xs text-red-400">
			<span class="text-red-600">[error]</span> {errorMessage}
			<button onclick={() => (errorMessage = '')} class="ml-2 text-red-600 hover:text-red-400">dismiss</button>
		</div>
	{/if}

	<!-- Input -->
	<div class="border-t border-zinc-800 pt-3">
		<div class="flex items-end gap-2">
			<span class="pb-2 text-sm text-pink-600">{'>'}</span>
			<textarea
				bind:this={composerEl}
				bind:value={input}
				onkeydown={handleKeydown}
				placeholder="..."
				rows="1"
				class="flex-1 resize-none bg-transparent py-1.5 text-sm text-pink-400 placeholder-zinc-700 focus:outline-none"
			></textarea>
			<button
				onclick={sendMessage}
				disabled={!input.trim()}
				class="pb-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-300 disabled:opacity-20"
			>
				[send]
			</button>
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
