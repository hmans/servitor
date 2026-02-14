import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { conversation } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { subscribe, isProcessing } from '$lib/server/agents/manager';

export function GET({ params, request }) {
	const conv = db.select().from(conversation).where(eq(conversation.id, params.id)).get();
	if (!conv) error(404, 'Conversation not found');

	let unsubscribe: (() => void) | undefined;
	let heartbeat: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const send = (event: string, data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					cleanup();
				}
			};

			send('connected', { conversationId: params.id, processing: isProcessing(params.id) });

			unsubscribe = subscribe(params.id, (event) => {
				send(event.type, event);
			});

			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': heartbeat\n\n'));
				} catch {
					cleanup();
				}
			}, 15000);

			// Clean up when the client disconnects
			request.signal.addEventListener('abort', () => cleanup());
		},
		cancel() {
			cleanup();
		}
	});

	function cleanup() {
		if (heartbeat) clearInterval(heartbeat);
		unsubscribe?.();
		heartbeat = undefined;
		unsubscribe = undefined;
	}

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
