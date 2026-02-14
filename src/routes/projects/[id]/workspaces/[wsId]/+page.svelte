<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, onDestroy, tick } from 'svelte';

	let { data } = $props();

	let input = $state('');
	let sending = $state(false);
	let streamingText = $state('');
	let streamingToolName = $state('');
	let messagesEl: HTMLDivElement | undefined = $state();
	let eventSource: EventSource | null = $state(null);

	// Displayed messages = persisted + streaming
	let displayMessages = $derived([
		...data.messages,
		...(streamingText || streamingToolName
			? [
					{
						id: '_streaming',
						role: 'assistant' as const,
						content: streamingText || `Using tool: ${streamingToolName}...`,
						createdAt: new Date()
					}
				]
			: [])
	]);

	function scrollToBottom() {
		tick().then(() => {
			if (messagesEl) {
				messagesEl.scrollTop = messagesEl.scrollHeight;
			}
		});
	}

	function connectSSE() {
		if (!data.activeConversationId) return;

		eventSource?.close();
		const es = new EventSource(`/api/conversations/${data.activeConversationId}/stream`);

		es.addEventListener('text_delta', (e) => {
			const event = JSON.parse(e.data);
			streamingText += event.text;
			streamingToolName = '';
			scrollToBottom();
		});

		es.addEventListener('tool_use_start', (e) => {
			const event = JSON.parse(e.data);
			streamingToolName = event.tool;
			scrollToBottom();
		});

		es.addEventListener('done', () => {
			sending = false;
			streamingText = '';
			streamingToolName = '';
			// Reload data to get persisted messages
			reloadMessages();
		});

		es.addEventListener('error', () => {
			// EventSource will auto-reconnect
		});

		eventSource = es;
	}

	async function reloadMessages() {
		// Re-fetch the page data to get fresh messages
		const res = await fetch(window.location.href, { headers: { accept: 'application/json' } });
		if (res.ok) {
			// SvelteKit will handle the data update through invalidation
			const { invalidate } = await import('$app/navigation');
			await invalidate(() => true);
		}
		scrollToBottom();
	}

	async function sendMessage() {
		if (!input.trim() || !data.activeConversationId || sending) return;

		const content = input.trim();
		input = '';
		sending = true;
		streamingText = '';
		streamingToolName = '';

		// Optimistically add user message
		data.messages = [
			...data.messages,
			{
				id: `_optimistic_${Date.now()}`,
				role: 'user',
				content,
				createdAt: new Date()
			}
		];
		scrollToBottom();

		try {
			await fetch(`/api/conversations/${data.activeConversationId}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});
		} catch {
			sending = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	onMount(() => {
		connectSSE();
		scrollToBottom();
	});

	onDestroy(() => {
		eventSource?.close();
	});

	// Reconnect SSE when conversation changes
	$effect(() => {
		if (data.activeConversationId) {
			connectSSE();
		}
	});
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-zinc-800 pb-4">
		<div>
			<div class="text-sm text-zinc-500">
				<a href="/projects/{data.project.id}" class="hover:text-zinc-300">{data.project.name}</a>
			</div>
			<h2 class="text-xl font-bold">{data.workspace.name}</h2>
		</div>
		<form method="POST" action="?/delete" use:enhance>
			<button
				type="submit"
				onclick={(e: MouseEvent) => {
					if (!confirm('Delete this workspace and its worktree?')) e.preventDefault();
				}}
				class="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-red-800 hover:text-red-400"
			>
				Delete
			</button>
		</form>
	</div>

	<!-- Conversation tabs -->
	<div class="flex items-center gap-1 border-b border-zinc-800 pt-3 pb-0">
		{#each data.conversations as conv}
			<a
				href="?conv={conv.id}"
				class="rounded-t-md px-3 py-2 text-sm transition-colors {conv.id ===
				data.activeConversationId
					? 'border-b-2 border-zinc-100 text-zinc-100'
					: 'text-zinc-500 hover:text-zinc-300'}"
			>
				{conv.title}
			</a>
		{/each}
		<form method="POST" action="?/new-conversation" use:enhance class="ml-1">
			<button
				type="submit"
				class="rounded-md px-2 py-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-300"
				title="New conversation"
			>
				+
			</button>
		</form>
	</div>

	{#if data.activeConversationId}
		<!-- Messages -->
		<div bind:this={messagesEl} class="flex-1 overflow-auto py-4">
			{#if displayMessages.length === 0}
				<div class="flex h-full items-center justify-center">
					<p class="text-zinc-600">Send a message to start the conversation.</p>
				</div>
			{:else}
				<div class="space-y-4">
					{#each displayMessages as msg (msg.id)}
						<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
							<div
								class="max-w-[80%] rounded-lg px-4 py-3 {msg.role === 'user'
									? 'bg-zinc-700 text-zinc-100'
									: 'bg-zinc-800/50 text-zinc-300'}"
							>
								<div class="whitespace-pre-wrap text-sm">{msg.content}</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Input -->
		<div class="border-t border-zinc-800 pt-4">
			<div class="flex gap-3">
				<textarea
					bind:value={input}
					onkeydown={handleKeydown}
					placeholder="Send a message..."
					rows="1"
					disabled={sending}
					class="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
				></textarea>
				<button
					onclick={sendMessage}
					disabled={!input.trim() || sending}
					class="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-30"
				>
					Send
				</button>
			</div>
		</div>
	{:else}
		<div class="flex flex-1 items-center justify-center">
			<form method="POST" action="?/new-conversation" use:enhance>
				<button
					type="submit"
					class="rounded-lg bg-zinc-800 px-6 py-3 text-zinc-300 transition-colors hover:bg-zinc-700"
				>
					Start a Conversation
				</button>
			</form>
		</div>
	{/if}
</div>
