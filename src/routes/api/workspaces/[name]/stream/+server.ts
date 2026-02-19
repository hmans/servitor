import { error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import { subscribe, isProcessing } from '$lib/server/agents/manager';

export function GET({ params, request }) {
	const ws = getWorkspace(params.name);
	if (!ws) error(404, 'Workspace not found');

	const managerKey = params.name;

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

			send('connected', { workspace: managerKey, processing: isProcessing(managerKey) });

			unsubscribe = subscribe(managerKey, (event) => {
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
