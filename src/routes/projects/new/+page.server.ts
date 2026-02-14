import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { fail, redirect } from '@sveltejs/kit';
import { existsSync, statSync } from 'fs';
import { join } from 'path';

export const actions = {
	default: async ({ request }) => {
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

		const created = db.insert(project).values({ name, repoPath }).returning().get();

		redirect(303, `/projects/${created.id}`);
	}
};
