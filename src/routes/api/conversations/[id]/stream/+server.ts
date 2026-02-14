import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { conversation } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { subscribe } from '$lib/server/agents/manager';

export function GET({ params }) {
	const conv = db.select().from(conversation).where(eq(conversation.id, params.id)).get();
	if (!conv) error(404, 'Conversation not found');

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const send = (event: string, data: unknown) => {
				controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			};

			// Send a heartbeat so the client knows we're connected
			send('connected', { conversationId: params.id });

			const unsubscribe = subscribe(params.id, (event) => {
				try {
					send(event.type, event);
				} catch {
					// Client disconnected
					unsubscribe();
				}
			});

			// Heartbeat to keep the connection alive
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': heartbeat\n\n'));
				} catch {
					clearInterval(heartbeat);
					unsubscribe();
				}
			}, 15000);

			// Clean up when the stream is cancelled
			const originalCancel = stream.cancel?.bind(stream);
			stream.cancel = (reason) => {
				clearInterval(heartbeat);
				unsubscribe();
				return originalCancel?.(reason) ?? Promise.resolve();
			};
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
