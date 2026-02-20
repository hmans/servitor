import { redirect } from '@sveltejs/kit';
import { MAIN_WORKSPACE_NAME } from '$lib/server/workspaces';

export function load() {
  redirect(302, `/workspaces/${MAIN_WORKSPACE_NAME}`);
}
