import { fail, redirect } from '@sveltejs/kit';
import { createWorkspace, MAIN_WORKSPACE_NAME } from '$lib/server/workspaces';

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const name = data.get('name')?.toString().trim();

    if (!name) return fail(400, { error: 'Name is required.', name });

    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      return fail(400, {
        error: 'Name must be lowercase alphanumeric with hyphens (e.g. "fix-login-bug").',
        name
      });
    }

    if (name === MAIN_WORKSPACE_NAME) {
      return fail(400, { error: `"${MAIN_WORKSPACE_NAME}" is a reserved name.`, name });
    }

    try {
      createWorkspace(name);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to create worktree.';
      return fail(400, { error: message, name });
    }

    redirect(303, `/workspaces/${name}`);
  }
};
