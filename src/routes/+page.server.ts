import { db } from '$lib/server/db';
import { workspace } from '$lib/server/db/schema';
import { asc } from 'drizzle-orm';

export async function load() {
	const workspaces = db.select().from(workspace).orderBy(asc(workspace.name)).all();
	return { workspaces };
}
