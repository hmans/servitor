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

  // Main workspace IS the base branch — no committed diff to show
  const commits = ws.isMainWorkspace ? [] : getCommits(ws.worktreePath, baseBranch);
  const committedDiff = ws.isMainWorkspace ? '' : getDiff(ws.worktreePath, baseBranch);
  const committedStatus = ws.isMainWorkspace ? [] : getStatus(ws.worktreePath, baseBranch);
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
