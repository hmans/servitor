import { error, redirect } from '@sveltejs/kit';
import { getWorkspace, deleteWorkspace } from '$lib/server/workspaces';
import { listConversations, createConversation, loadMessages } from '$lib/server/conversations';
import {
	getDefaultBranch,
	getCommits,
	getDiff,
	getUncommittedDiff,
	getStatus,
	getUncommittedStatus
} from '$lib/server/git';

export async function load({ params, url }) {
	const ws = getWorkspace(params.name);
	if (!ws) error(404, 'Workspace not found');

	const conversations = listConversations(ws.worktreePath);

	// Which conversation is active?
	const convParam = url.searchParams.get('conv');
	const activeConvId = convParam ? parseInt(convParam) : (conversations[0]?.id ?? null);

	let messages: Array<{
		role: string;
		content: string;
		toolInvocations?: Array<{ tool: string; toolUseId: string; input: string }>;
		ts: string;
	}> = [];

	if (activeConvId) {
		messages = loadMessages(ws.worktreePath, activeConvId);
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
		const ws = getWorkspace(params.name);
		if (!ws) error(404, 'Workspace not found');

		deleteWorkspace(params.name);
		redirect(303, '/');
	},

	'new-conversation': async ({ params }) => {
		const ws = getWorkspace(params.name);
		if (!ws) error(404, 'Workspace not found');

		const conv = createConversation(ws.worktreePath);
		redirect(303, `/workspaces/${params.name}?conv=${conv.id}`);
	}
};
