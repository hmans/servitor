import { db } from '$lib/server/db';
import { workspace } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { createWorktree } from '$lib/server/git';

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

		let branch: string;
		let worktreePath: string;

		try {
			({ branch, worktreePath } = createWorktree(name));
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to create worktree.';
			return fail(400, { error: message, name });
		}

		const created = db
			.insert(workspace)
			.values({ name, branch, worktreePath })
			.returning()
			.get();

		redirect(303, `/workspaces/${created.id}`);
	}
};
