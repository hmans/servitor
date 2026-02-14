import { db } from '$lib/server/db';
import { project, workspace, conversation, message } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import { removeWorktree } from '$lib/server/git';

export async function load({ params, url }) {
	const ws = db.select().from(workspace).where(eq(workspace.id, params.wsId)).get();
	if (!ws) error(404, 'Workspace not found');

	const proj = db.select().from(project).where(eq(project.id, params.id)).get();
	if (!proj) error(404, 'Project not found');

	const conversations = db
		.select()
		.from(conversation)
		.where(eq(conversation.workspaceId, params.wsId))
		.orderBy(asc(conversation.createdAt))
		.all();

	// Which conversation is active?
	const activeConvId = url.searchParams.get('conv') ?? conversations[0]?.id ?? null;

	let messages: Array<{
		id: string;
		role: string;
		content: string;
		createdAt: Date;
	}> = [];

	if (activeConvId) {
		messages = db
			.select()
			.from(message)
			.where(eq(message.conversationId, activeConvId))
			.orderBy(asc(message.createdAt))
			.all();
	}

	return {
		workspace: ws,
		project: proj,
		conversations,
		activeConversationId: activeConvId,
		messages
	};
}

export const actions = {
	delete: async ({ params }) => {
		const ws = db.select().from(workspace).where(eq(workspace.id, params.wsId)).get();
		if (!ws) error(404, 'Workspace not found');

		const proj = db.select().from(project).where(eq(project.id, params.id)).get();
		if (!proj) error(404, 'Project not found');

		try {
			removeWorktree(proj.repoPath, ws.worktreePath, ws.branch);
		} catch {
			// Worktree may already be gone
		}

		db.delete(workspace).where(eq(workspace.id, params.wsId)).run();
		redirect(303, `/projects/${params.id}`);
	},

	'new-conversation': async ({ params }) => {
		const ws = db.select().from(workspace).where(eq(workspace.id, params.wsId)).get();
		if (!ws) error(404, 'Workspace not found');

		const count = db
			.select()
			.from(conversation)
			.where(eq(conversation.workspaceId, params.wsId))
			.all().length;

		const conv = db
			.insert(conversation)
			.values({
				workspaceId: params.wsId,
				title: `Conversation ${count + 1}`
			})
			.returning()
			.get();

		redirect(303, `/projects/${params.id}/workspaces/${params.wsId}?conv=${conv.id}`);
	}
};
