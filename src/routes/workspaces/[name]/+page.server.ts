import { error, redirect } from '@sveltejs/kit';
import { getWorkspace, deleteWorkspace } from '$lib/server/workspaces';
import { ensureConversation, loadMessages } from '$lib/server/conversations';
import {
	getDefaultBranch,
	getCommits,
	getDiff,
	getUncommittedDiff,
	getStatus,
	getUncommittedStatus
} from '$lib/server/git';

export async function load({ params }) {
	const ws = getWorkspace(params.name);
	if (!ws) error(404, 'Workspace not found');

	const meta = ensureConversation(ws.worktreePath);
	const messages = loadMessages(ws.worktreePath);

	const baseBranch = getDefaultBranch();
	const commits = getCommits(ws.worktreePath, baseBranch);
	const committedDiff = getDiff(ws.worktreePath, baseBranch);
	const committedStatus = getStatus(ws.worktreePath, baseBranch);
	const uncommittedDiff = getUncommittedDiff(ws.worktreePath);
	const uncommittedStatus = getUncommittedStatus(ws.worktreePath);

	return {
		workspace: ws,
		messages,
		executionMode: meta.executionMode ?? 'build',
		pendingInteraction: meta.pendingInteraction ?? null,
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
	}
};
