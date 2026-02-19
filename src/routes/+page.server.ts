import { listWorkspaces } from '$lib/server/workspaces';

export async function load() {
	const workspaces = listWorkspaces();
	return { workspaces };
}
