import { json, error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import { ensureConversation, updateConversationMeta } from '$lib/server/conversations';
import { killProcess } from '$lib/server/agents/manager';

const VALID_MODES = ['plan', 'build'] as const;

export async function PUT({ params, request }) {
	const ws = getWorkspace(params.name);
	if (!ws) error(404, 'Workspace not found');

	ensureConversation(ws.worktreePath);

	const body = await request.json();
	const mode = body.mode;

	if (!VALID_MODES.includes(mode)) {
		error(400, `Invalid mode: ${mode}. Must be one of: ${VALID_MODES.join(', ')}`);
	}

	updateConversationMeta(ws.worktreePath, { executionMode: mode });

	// Kill any running process — mode change takes effect on next spawn
	killProcess(params.name);

	return json({ ok: true, mode });
}
