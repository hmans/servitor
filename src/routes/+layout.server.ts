import { db } from '$lib/server/db';
import { project } from '$lib/server/db/schema';
import { asc } from 'drizzle-orm';

export async function load() {
	const projects = db.select().from(project).orderBy(asc(project.name)).all();
	return { projects };
}
