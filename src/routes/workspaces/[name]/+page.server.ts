import { error, redirect } from '@sveltejs/kit';
import { getWorkspace, deleteWorkspace } from '$lib/server/workspaces';
import { ensureConversation, loadMessages } from '$lib/server/conversations';

export async function load({ parent }) {
  const { workspace } = await parent();

  const meta = ensureConversation(workspace.worktreePath);
  const messages = loadMessages(workspace.worktreePath);

  return {
    messages,
    executionMode: meta.executionMode ?? 'build',
    pendingInteraction: meta.pendingInteraction ?? null
  };
}

export const actions = {
  delete: async ({ params }) => {
    const ws = getWorkspace(params.name);
    if (!ws) error(404, 'Workspace not found');
    if (ws.isMainWorkspace) error(403, 'Cannot delete the main workspace');

    deleteWorkspace(params.name);
    redirect(303, '/');
  }
};
