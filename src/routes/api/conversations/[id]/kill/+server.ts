import { json, error } from '@sveltejs/kit';
import { killProcess, isProcessing } from '$lib/server/agents/manager';

export function POST({ params }) {
	if (!isProcessing(params.id)) {
		error(404, 'No active process for this conversation');
	}

	killProcess(params.id);
	return json({ killed: true });
}
