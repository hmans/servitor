import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const project = sqliteTable('project', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	repoPath: text('repo_path').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const workspace = sqliteTable('workspace', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	projectId: text('project_id')
		.notNull()
		.references(() => project.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	branch: text('branch').notNull(),
	worktreePath: text('worktree_path').notNull(),
	status: text('status', { enum: ['active', 'archived'] })
		.notNull()
		.default('active'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const conversation = sqliteTable('conversation', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	workspaceId: text('workspace_id')
		.notNull()
		.references(() => workspace.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	agentType: text('agent_type').notNull().default('claude-code'),
	agentSessionId: text('agent_session_id'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const message = sqliteTable('message', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	conversationId: text('conversation_id')
		.notNull()
		.references(() => conversation.id, { onDelete: 'cascade' }),
	role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
	content: text('content').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date())
});
