import { db } from '$lib/server/db';
import { workspace, conversation } from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';
import { config } from '$lib/server/config';

export async function load() {
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

	const convsByWorkspace = Map.groupBy(conversations, (c) => c.workspaceId);

	const tree = workspaces.map((ws) => ({
		...ws,
		conversations: convsByWorkspace.get(ws.id) ?? []
	}));

	return { workspaces: tree, projectName: config.projectName };
}
