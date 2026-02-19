<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import { onDestroy, tick } from 'svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import InfoPane from '$lib/components/InfoPane.svelte';
	import PaneResizer from '$lib/components/PaneResizer.svelte';
	import BrailleSpinner from '$lib/components/BrailleSpinner.svelte';

	let { data } = $props();

	let infoPaneWidth = $state(400);
	let input = $state('');
	let sendingConvId = $state<number | null>(null);
	let processAlive = $state(false);
	let errorMessage = $state('');
	let messagesEl: HTMLDivElement | undefined = $state();
	let composerEl: HTMLTextAreaElement | undefined = $state();
	let eventSource: EventSource | null = null;

	// Streaming state — built up as SSE events arrive
	let streamingParts: Array<
		| { type: 'text'; text: string }
		| { type: 'tool_use'; tool: string; input: string; toolUseId: string }
	> = $state([]);

	// Local copy of messages for optimistic updates
	let localMessages: Array<{
		role: string;
		content: string;
		toolInvocations?: Array<{ tool: string; toolUseId: string; input: string }>;
		ts: string;
	}> = $state([]);

	// Sync from server data when it changes
	$effect(() => {
		localMessages = [...data.messages];
		scrollToBottom();
	});

	// Focus composer on every navigation (entering/switching conversations)
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
		const convId = data.activeConversationId;
		if (!convId) return;

		// Reset per-conversation state when switching
		streamingParts = [];
		sendingConvId = null;
		processAlive = false;

		const es = new EventSource(`/api/workspaces/${wsName}/conversations/${convId}/stream`);

		es.addEventListener('connected', (e) => {
			const event = JSON.parse(e.data);
			console.log('[claude] connected', event);
			processAlive = !!event.processing;
		});

		es.addEventListener('text_delta', (e) => {
			const event = JSON.parse(e.data);
			console.log('[claude] text_delta', event);
			processAlive = true;
			sendingConvId = null;
			streamingParts = [...streamingParts, { type: 'text', text: event.text }];
			scrollToBottom();
		});

		es.addEventListener('tool_use_start', (e) => {
			const event = JSON.parse(e.data);
			console.log('[claude] tool_use_start', event);
			processAlive = true;
			sendingConvId = null;
			streamingParts = [
				...streamingParts,
				{ type: 'tool_use', tool: event.tool, input: event.input ?? '', toolUseId: event.toolUseId }
			];
			scrollToBottom();
		});

		es.addEventListener('message_complete', async () => {
			console.log('[claude] message_complete');
			sendingConvId = null;
			processAlive = false;
			streamingParts = [];
			await invalidateAll();
			scrollToBottom();
		});

		es.addEventListener('done', async () => {
			console.log('[claude] done (process exited)');
			sendingConvId = null;
			processAlive = false;
			streamingParts = [];
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
			sendingConvId = null;
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
		if (!input.trim() || !data.activeConversationId) return;

		const content = input.trim();
		input = '';
		sendingConvId = data.activeConversationId ?? null;
		errorMessage = '';

		localMessages = [
			...localMessages,
			{ role: 'user', content, ts: new Date().toISOString() }
		];
		scrollToBottom();

		try {
			const res = await fetch(`/api/workspaces/${wsName}/conversations/${data.activeConversationId}/messages`, {
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
			{#if processAlive || sendingConvId}
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

	{#if data.activeConversationId}
		<!-- Messages -->
		<div bind:this={messagesEl} class="flex-1 overflow-auto py-3">
			{#if localMessages.length === 0 && sendingConvId !== data.activeConversationId}
				<div class="flex h-full items-center justify-center">
					<p class="text-sm text-zinc-600">Type a message to begin.</p>
				</div>
			{:else}
				<div class="space-y-6 leading-[1.8]">
					{#each localMessages as msg, i (i)}
						<div class="group">
							{#if msg.role === 'user'}
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
								{/if}
							{/each}
							<div class="pl-3">
								<BrailleSpinner />
							</div>
						</div>
					{:else if sendingConvId === data.activeConversationId}
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
	{:else}
		<div class="flex flex-1 items-center justify-center">
			<form method="POST" action="?/new-conversation" use:enhance>
				<button
					type="submit"
					class="text-sm text-zinc-500 transition-colors hover:text-zinc-200"
				>
					[start conversation]
				</button>
			</form>
		</div>
	{/if}
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
