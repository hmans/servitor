import { logger } from '$lib/server/logger';
import { killAll } from '$lib/server/agents/manager';
import type { Handle, HandleServerError } from '@sveltejs/kit';

function shutdown() {
	logger.info('Shutting down');
	killAll();
	process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export const handle: Handle = async ({ event, resolve }) => {
	const start = performance.now();
	const response = await resolve(event);
	const duration = Math.round(performance.now() - start);

	logger.info(
		{
			method: event.request.method,
			path: event.url.pathname,
			status: response.status,
			duration
		},
		`${event.request.method} ${event.url.pathname} ${response.status} ${duration}ms`
	);

	return response;
};

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
	logger.error(
		{
			err: error,
			method: event.request.method,
			path: event.url.pathname,
			status,
			message
		},
		`Server error: ${event.request.method} ${event.url.pathname}`
	);
};
