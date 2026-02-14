import { db } from '$lib/server/db';
import { project, workspace, conversation } from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';

export async function load() {
	const projects = db.select().from(project).orderBy(asc(project.name)).all();

	const workspaces = db
		.select()
		.from(workspace)
		.where(eq(workspace.status, 'active'))
		.orderBy(asc(workspace.name))
		.all();

	const conversations = db
		.select({ id: conversation.id, workspaceId: conversation.workspaceId, title: conversation.title })
		.from(conversation)
		.orderBy(asc(conversation.createdAt))
		.all();

	// Build the tree
	const convsByWorkspace = Map.groupBy(conversations, (c) => c.workspaceId);
	const wsByProject = Map.groupBy(
		workspaces.map((ws) => ({
			...ws,
			conversations: convsByWorkspace.get(ws.id) ?? []
		})),
		(ws) => ws.projectId
	);

	const tree = projects.map((p) => ({
		...p,
		workspaces: wsByProject.get(p.id) ?? []
	}));

	return { projects: tree };
}
