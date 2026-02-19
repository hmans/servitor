import { json, error } from '@sveltejs/kit';
import { killProcess, isProcessing } from '$lib/server/agents/manager';

export function POST({ params }) {
	const managerKey = `${params.name}:${params.convId}`;

	if (!isProcessing(managerKey)) {
		error(404, 'No active process for this conversation');
	}

	killProcess(managerKey);
	return json({ killed: true });
}
