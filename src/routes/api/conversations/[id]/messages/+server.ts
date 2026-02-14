import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { conversation, message, workspace } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { sendMessage } from '$lib/server/agents/manager';

export async function POST({ params, request }) {
	const conv = db.select().from(conversation).where(eq(conversation.id, params.id)).get();
	if (!conv) error(404, 'Conversation not found');

	const ws = db.select().from(workspace).where(eq(workspace.id, conv.workspaceId)).get();
	if (!ws) error(404, 'Workspace not found');

	const body = await request.json();
	const content = body.content?.trim();
	if (!content) error(400, 'Content is required');

	// Persist user message
	const userMsg = db
		.insert(message)
		.values({ conversationId: params.id, role: 'user', content })
		.returning()
		.get();

	// Send to agent
	sendMessage(params.id, {
		messageId: userMsg.id,
		content,
		agentType: conv.agentType,
		cwd: ws.worktreePath,
		onComplete: (text, sessionId, toolInvocations) => {
			// Persist assistant message
			if (text) {
				db.insert(message)
					.values({
						conversationId: params.id,
						role: 'assistant',
						content: text,
						toolInvocations: toolInvocations.length > 0 ? JSON.stringify(toolInvocations) : null
					})
					.run();
			}

			// Update session ID for future turns
			if (sessionId && sessionId !== conv.agentSessionId) {
				db.update(conversation)
					.set({ agentSessionId: sessionId, updatedAt: new Date() })
					.where(eq(conversation.id, params.id))
					.run();
			}
		}
	});

	return json({ messageId: userMsg.id });
}
