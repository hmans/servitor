import { db } from '$lib/server/db';
import { project, workspace } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail, redirect, error } from '@sveltejs/kit';
import { createWorktree } from '$lib/server/git';

export async function load({ params }) {
	const proj = db.select().from(project).where(eq(project.id, params.id)).get();
	if (!proj) error(404, 'Project not found');
	return { project: proj };
}

export const actions = {
	default: async ({ params, request }) => {
		const proj = db.select().from(project).where(eq(project.id, params.id)).get();
		if (!proj) error(404, 'Project not found');

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
			({ branch, worktreePath } = createWorktree(proj.repoPath, name));
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to create worktree.';
			return fail(400, { error: message, name });
		}

		const created = db
			.insert(workspace)
			.values({ name, projectId: params.id, branch, worktreePath })
			.returning()
			.get();

		redirect(303, `/projects/${params.id}/workspaces/${created.id}`);
	}
};
