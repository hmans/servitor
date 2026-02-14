<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy, tick } from 'svelte';
	import Markdown from '$lib/components/Markdown.svelte';

	let { data } = $props();

	let input = $state('');
	let sending = $state(false);
	let errorMessage = $state('');
	let messagesEl: HTMLDivElement | undefined = $state();
	let eventSource: EventSource | null = null;

	// Streaming state — built up as SSE events arrive
	let streamingParts: Array<
		| { type: 'text'; text: string }
		| { type: 'tool_use'; tool: string; input: string; toolUseId: string }
	> = $state([]);

	// Local copy of messages for optimistic updates
	let localMessages: Array<{ id: string; role: string; content: string; createdAt: Date }> =
		$state([]);

	// Sync from server data when it changes
	$effect(() => {
		localMessages = [...data.messages];
	});

	function scrollToBottom() {
		tick().then(() => {
			if (messagesEl) {
				messagesEl.scrollTop = messagesEl.scrollHeight;
			}
		});
	}

	// SSE lifecycle
	$effect(() => {
		const convId = data.activeConversationId;
		if (!convId) return;

		const es = new EventSource(`/api/conversations/${convId}/stream`);

		es.addEventListener('text_delta', (e) => {
			const event = JSON.parse(e.data);
			streamingParts = [...streamingParts, { type: 'text', text: event.text }];
			scrollToBottom();
		});

		es.addEventListener('tool_use_start', (e) => {
			const event = JSON.parse(e.data);
			streamingParts = [
				...streamingParts,
				{ type: 'tool_use', tool: event.tool, input: event.input ?? '', toolUseId: event.toolUseId }
			];
			scrollToBottom();
		});

		es.addEventListener('done', async () => {
			sending = false;
			streamingParts = [];
			await invalidateAll();
			scrollToBottom();
		});

		es.addEventListener('error', (e) => {
			try {
				const event = JSON.parse((e as MessageEvent).data);
				if (event.message) errorMessage = event.message;
			} catch {
				// Native EventSource error
			}
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
		sending = true;
		errorMessage = '';

		localMessages = [
			...localMessages,
			{ id: `_optimistic_${Date.now()}`, role: 'user', content, createdAt: new Date() }
		];
		scrollToBottom();

		try {
			const res = await fetch(`/api/conversations/${data.activeConversationId}/messages`, {
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
			{#if localMessages.length === 0 && !sending}
				<div class="flex h-full items-center justify-center">
					<p class="text-zinc-600">Send a message to start the conversation.</p>
				</div>
			{:else}
				<div class="space-y-4">
					{#each localMessages as msg (msg.id)}
						<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
							<div
								class="max-w-[80%] rounded-lg px-4 py-3 {msg.role === 'user'
									? 'bg-zinc-700 text-zinc-100'
									: 'bg-zinc-800/50 text-zinc-300'}"
							>
								{#if msg.role === 'user'}
								<div class="whitespace-pre-wrap text-sm">{msg.content}</div>
							{:else}
								<Markdown content={msg.content} />
							{/if}
							</div>
						</div>
					{/each}

					<!-- Streaming content -->
					{#if streamingParts.length > 0}
						<div class="flex justify-start">
							<div class="max-w-[80%] space-y-2">
								{#each streamingParts as part, i (i)}
									{#if part.type === 'text'}
										<div class="rounded-lg bg-zinc-800/50 px-4 py-3 text-zinc-300">
											<Markdown content={part.text} />
										</div>
									{:else if part.type === 'tool_use'}
										<div
											class="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
										>
											<span
												class="mt-0.5 shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-xs text-zinc-300"
											>
												{part.tool}
											</span>
											{#if part.input}
												<span class="truncate font-mono text-xs text-zinc-500">
													{part.input}
												</span>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						</div>
					{:else if sending}
						<div class="flex justify-start">
							<div class="rounded-lg bg-zinc-800/50 px-4 py-3 text-sm text-zinc-500">
								Thinking...
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Error -->
		{#if errorMessage}
			<div class="border-t border-red-900 bg-red-950/50 px-4 py-2 text-sm text-red-400">
				{errorMessage}
				<button onclick={() => (errorMessage = '')} class="ml-2 underline">dismiss</button>
			</div>
		{/if}

		<!-- Input -->
		<div class="border-t border-zinc-800 pt-4">
			<div class="flex gap-3">
				<textarea
					bind:value={input}
					onkeydown={handleKeydown}
					placeholder="Send a message..."
					rows="1"
					class="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
				></textarea>
				<button
					onclick={sendMessage}
					disabled={!input.trim()}
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
