import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

export interface ConversationMeta {
	id: number;
	title: string;
	agentType: string;
	agentSessionId?: string;
	createdAt: string;
}

export interface ToolInvocation {
	tool: string;
	toolUseId: string;
	input: string;
}

export interface Message {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	toolInvocations?: ToolInvocation[];
	ts: string;
}

const SERVITOR_DIR = '.servitor';
const CONVERSATIONS_DIR = 'conversations';

function conversationsDir(worktreePath: string): string {
	return join(worktreePath, SERVITOR_DIR, CONVERSATIONS_DIR);
}

function conversationDir(worktreePath: string, convId: number): string {
	return join(conversationsDir(worktreePath), String(convId));
}

function metaPath(worktreePath: string, convId: number): string {
	return join(conversationDir(worktreePath, convId), 'meta.json');
}

function messagesPath(worktreePath: string, convId: number): string {
	return join(conversationDir(worktreePath, convId), 'messages.jsonl');
}

export function listConversations(worktreePath: string): ConversationMeta[] {
	const dir = conversationsDir(worktreePath);
	if (!existsSync(dir)) return [];

	const entries = readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
		.map((e) => parseInt(e.name))
		.sort((a, b) => a - b);

	const conversations: ConversationMeta[] = [];
	for (const id of entries) {
		const meta = readMeta(worktreePath, id);
		if (meta) conversations.push(meta);
	}
	return conversations;
}

export function getConversation(worktreePath: string, convId: number): ConversationMeta | undefined {
	return readMeta(worktreePath, convId);
}

export function createConversation(worktreePath: string): ConversationMeta {
	const existing = listConversations(worktreePath);
	const nextId = existing.length > 0 ? Math.max(...existing.map((c) => c.id)) + 1 : 1;

	const dir = conversationDir(worktreePath, nextId);
	mkdirSync(dir, { recursive: true });

	const meta: ConversationMeta = {
		id: nextId,
		title: `Conversation ${nextId}`,
		agentType: 'claude-code',
		createdAt: new Date().toISOString()
	};

	writeFileSync(metaPath(worktreePath, nextId), JSON.stringify(meta, null, '\t') + '\n');
	return meta;
}

export function deleteConversation(worktreePath: string, convId: number): void {
	const dir = conversationDir(worktreePath, convId);
	if (existsSync(dir)) {
		rmSync(dir, { recursive: true });
	}
}

export function loadMessages(worktreePath: string, convId: number): Message[] {
	const path = messagesPath(worktreePath, convId);
	if (!existsSync(path)) return [];

	const content = readFileSync(path, 'utf-8').trim();
	if (!content) return [];

	return content.split('\n').map((line) => JSON.parse(line) as Message);
}

export function appendMessage(worktreePath: string, convId: number, msg: Message): void {
	const dir = conversationDir(worktreePath, convId);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	appendFileSync(messagesPath(worktreePath, convId), JSON.stringify(msg) + '\n');
}

export function updateConversationMeta(
	worktreePath: string,
	convId: number,
	updates: Partial<Pick<ConversationMeta, 'agentSessionId'>>
): void {
	const meta = readMeta(worktreePath, convId);
	if (!meta) return;

	const updated = { ...meta, ...updates };
	writeFileSync(metaPath(worktreePath, convId), JSON.stringify(updated, null, '\t') + '\n');
}

function readMeta(worktreePath: string, convId: number): ConversationMeta | undefined {
	const path = metaPath(worktreePath, convId);
	if (!existsSync(path)) return undefined;

	try {
		return JSON.parse(readFileSync(path, 'utf-8')) as ConversationMeta;
	} catch {
		return undefined;
	}
}
