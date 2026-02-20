import { listWorkspaces } from '$lib/server/workspaces';
import { config } from '$lib/server/config';

export async function load() {
  const workspaces = listWorkspaces();
  return { workspaces, projectName: config.projectName };
}
