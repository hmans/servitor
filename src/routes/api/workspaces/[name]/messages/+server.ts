import { json, error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import {
	ensureConversation,
	appendMessage,
	updateConversationMeta,
	clearPendingInteraction
} from '$lib/server/conversations';
import { sendMessage } from '$lib/server/agents/manager';

export async function POST({ params, request }) {
	const ws = getWorkspace(params.name);
	if (!ws) error(404, 'Workspace not found');

	const conv = ensureConversation(ws.worktreePath);

	const body = await request.json();
	const content = body.content?.trim();
	if (!content) error(400, 'Content is required');

	const ts = new Date().toISOString();

	// Persist user message
	const msg: Parameters<typeof appendMessage>[1] = { role: 'user', content, ts };
	if (body.askUserAnswers) {
		msg.askUserAnswers = body.askUserAnswers;
	}
	appendMessage(ws.worktreePath, msg);

	// Clear any pending interaction (ask_user / exit_plan) since the user is responding
	clearPendingInteraction(ws.worktreePath);

	// Agent manager key — just the workspace name
	const managerKey = params.name;

	// Send to agent
	sendMessage(managerKey, {
		messageId: ts,
		content,
		agentType: conv.agentType,
		cwd: ws.worktreePath,
		sessionId: conv.agentSessionId,
		executionMode: conv.executionMode ?? 'build',
		onComplete: (text, sessionId, toolInvocations) => {
			// Persist assistant message
			if (text) {
				appendMessage(ws.worktreePath, {
					role: 'assistant',
					content: text,
					toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
					ts: new Date().toISOString()
				});
			}

			// Update session ID for future turns
			if (sessionId && sessionId !== conv.agentSessionId) {
				updateConversationMeta(ws.worktreePath, { agentSessionId: sessionId });
			}
		}
	});

	return json({ ok: true });
}
