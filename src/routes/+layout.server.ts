import { listWorkspaces } from '$lib/server/workspaces';
import { listConversations } from '$lib/server/conversations';
import { config } from '$lib/server/config';

export async function load() {
	const workspaces = listWorkspaces();

	const tree = workspaces.map((ws) => ({
		...ws,
		conversations: listConversations(ws.worktreePath)
	}));

	return { workspaces: tree, projectName: config.projectName };
}
