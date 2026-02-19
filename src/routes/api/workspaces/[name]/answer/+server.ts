import { json, error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import { sendToolResult } from '$lib/server/agents/manager';

export async function POST({ params, request }) {
	const ws = getWorkspace(params.name);
	if (!ws) error(404, 'Workspace not found');

	const body = await request.json();
	const { toolUseId, answers } = body;

	if (!toolUseId || !answers) {
		error(400, 'toolUseId and answers are required');
	}

	sendToolResult(params.name, toolUseId, JSON.stringify(answers));

	return json({ ok: true });
}
