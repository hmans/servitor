import { db } from '$lib/server/db';
import { workspace, conversation, message } from '$lib/server/db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import { removeWorktree, getDefaultBranch, getCommits, getDiff, getUncommittedDiff, getStatus, getUncommittedStatus } from '$lib/server/git';

export async function load({ params, url }) {
	const ws = db.select().from(workspace).where(eq(workspace.id, params.id)).get();
	if (!ws) error(404, 'Workspace not found');

	const conversations = db
		.select()
		.from(conversation)
		.where(eq(conversation.workspaceId, params.id))
		.orderBy(asc(conversation.createdAt))
		.all();

	// Which conversation is active?
	const activeConvId = url.searchParams.get('conv') ?? conversations[0]?.id ?? null;

	let messages: Array<{
		id: string;
		role: string;
		content: string;
		toolInvocations: string | null;
		createdAt: Date;
	}> = [];

	if (activeConvId) {
		messages = db
			.select()
			.from(message)
			.where(eq(message.conversationId, activeConvId))
			.orderBy(asc(message.createdAt), asc(sql`rowid`))
			.all();
	}

	const baseBranch = getDefaultBranch();
	const commits = getCommits(ws.worktreePath, baseBranch);
	const committedDiff = getDiff(ws.worktreePath, baseBranch);
	const committedStatus = getStatus(ws.worktreePath, baseBranch);
	const uncommittedDiff = getUncommittedDiff(ws.worktreePath);
	const uncommittedStatus = getUncommittedStatus(ws.worktreePath);

	return {
		workspace: ws,
		conversations,
		activeConversationId: activeConvId,
		messages,
		commits,
		committedDiff,
		committedStatus,
		uncommittedDiff,
		uncommittedStatus
	};
}

export const actions = {
	delete: async ({ params }) => {
		const ws = db.select().from(workspace).where(eq(workspace.id, params.id)).get();
		if (!ws) error(404, 'Workspace not found');

		try {
			removeWorktree(ws.worktreePath, ws.branch);
		} catch {
			// Worktree may already be gone
		}

		db.delete(workspace).where(eq(workspace.id, params.id)).run();
		redirect(303, '/');
	},

	'new-conversation': async ({ params }) => {
		const ws = db.select().from(workspace).where(eq(workspace.id, params.id)).get();
		if (!ws) error(404, 'Workspace not found');

		const count = db
			.select()
			.from(conversation)
			.where(eq(conversation.workspaceId, params.id))
			.all().length;

		const conv = db
			.insert(conversation)
			.values({
				workspaceId: params.id,
				title: `Conversation ${count + 1}`
			})
			.returning()
			.get();

		redirect(303, `/workspaces/${params.id}?conv=${conv.id}`);
	}
};
