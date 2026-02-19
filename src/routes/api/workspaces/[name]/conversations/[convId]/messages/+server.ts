import { json, error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import { getConversation, appendMessage, updateConversationMeta } from '$lib/server/conversations';
import { sendMessage } from '$lib/server/agents/manager';

export async function POST({ params, request }) {
	const ws = getWorkspace(params.name);
	if (!ws) error(404, 'Workspace not found');

	const convId = parseInt(params.convId);
	const conv = getConversation(ws.worktreePath, convId);
	if (!conv) error(404, 'Conversation not found');

	const body = await request.json();
	const content = body.content?.trim();
	if (!content) error(400, 'Content is required');

	const ts = new Date().toISOString();

	// Persist user message
	appendMessage(ws.worktreePath, convId, { role: 'user', content, ts });

	// Agent manager key
	const managerKey = `${params.name}:${convId}`;

	// Send to agent
	sendMessage(managerKey, {
		messageId: ts,
		content,
		agentType: conv.agentType,
		cwd: ws.worktreePath,
		onComplete: (text, sessionId, toolInvocations) => {
			// Persist assistant message
			if (text) {
				appendMessage(ws.worktreePath, convId, {
					role: 'assistant',
					content: text,
					toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
					ts: new Date().toISOString()
				});
			}

			// Update session ID for future turns
			if (sessionId && sessionId !== conv.agentSessionId) {
				updateConversationMeta(ws.worktreePath, convId, { agentSessionId: sessionId });
			}
		}
	});

	return json({ ok: true });
}
