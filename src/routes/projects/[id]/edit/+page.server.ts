import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail, redirect, error } from '@sveltejs/kit';
import { existsSync, statSync } from 'fs';
import { join } from 'path';

export async function load({ params }) {
	const row = db.select().from(project).where(eq(project.id, params.id)).get();
	if (!row) error(404, 'Project not found');
	return { project: row };
}

export const actions = {
	update: async ({ params, request }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim();
		const repoPath = data.get('repoPath')?.toString().trim();

		if (!name) return fail(400, { error: 'Name is required.', name, repoPath });
		if (!repoPath) return fail(400, { error: 'Repository path is required.', name, repoPath });

		if (!existsSync(repoPath) || !statSync(repoPath).isDirectory()) {
			return fail(400, { error: 'Path does not exist or is not a directory.', name, repoPath });
		}

		const gitDir = join(repoPath, '.git');
		if (!existsSync(gitDir)) {
			return fail(400, { error: 'Path is not a git repository (no .git found).', name, repoPath });
		}

		db.update(project)
			.set({ name, repoPath, updatedAt: new Date() })
			.where(eq(project.id, params.id))
			.run();

		redirect(303, `/projects/${params.id}`);
	},

	delete: async ({ params }) => {
		db.delete(project).where(eq(project.id, params.id)).run();
		redirect(303, '/');
	}
};
