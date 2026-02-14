import { db } from '$lib/server/db';
import { project, workspace } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const row = db.select().from(project).where(eq(project.id, params.id)).get();
	if (!row) error(404, 'Project not found');

	const workspaces = db
		.select()
		.from(workspace)
		.where(eq(workspace.projectId, params.id))
		.orderBy(asc(workspace.name))
		.all();

	return { project: row, workspaces };
}
