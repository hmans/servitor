import { error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
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

	const baseBranch = getDefaultBranch();
	const commits = getCommits(ws.worktreePath, baseBranch);
	const committedDiff = getDiff(ws.worktreePath, baseBranch);
	const committedStatus = getStatus(ws.worktreePath, baseBranch);
	const uncommittedDiff = getUncommittedDiff(ws.worktreePath);
	const uncommittedStatus = getUncommittedStatus(ws.worktreePath);

	return {
		workspace: ws,
		commits,
		committedDiff,
		committedStatus,
		uncommittedDiff,
		uncommittedStatus
	};
}
