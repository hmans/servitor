const HEARTBEAT_INTERVAL = 15_000;

type SendFn = (event: string, data: unknown) => void;

/**
 * Creates an SSE Response with heartbeat, abort handling, and cleanup.
 * The `setup` callback receives a `send` function and should return
 * an optional teardown function (e.g. to unsubscribe from events).
 */
export function createSSEResponse(
	request: Request,
	setup: (send: SendFn) => (() => void) | void
): Response {
	let teardown: (() => void) | undefined;
	let heartbeat: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const send: SendFn = (event, data) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					cleanup();
				}
			};

			const result = setup(send);
			if (result) teardown = result;

			heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': heartbeat\n\n'));
				} catch {
					cleanup();
				}
			}, HEARTBEAT_INTERVAL);

			request.signal.addEventListener('abort', () => cleanup());
		},
		cancel() {
			cleanup();
		}
	});

	function cleanup() {
		if (heartbeat) clearInterval(heartbeat);
		teardown?.();
		heartbeat = undefined;
		teardown = undefined;
	}

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
