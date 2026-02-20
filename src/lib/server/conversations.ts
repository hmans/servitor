import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import type { ExecutionMode } from './agents/types';

export type { ExecutionMode };

export type PendingInteraction =
  | { type: 'enter_plan' }
  | {
      type: 'ask_user';
      questions: Array<{
        question: string;
        header: string;
        options: Array<{ label: string; description: string; markdown?: string }>;
        multiSelect: boolean;
      }>;
    }
  | {
      type: 'exit_plan';
      allowedPrompts?: Array<{ tool: string; prompt: string }>;
      planContent?: string;
      planFilePath?: string;
    };

export interface ConversationMeta {
  title: string;
  agentType: string;
  agentSessionId?: string;
  executionMode?: ExecutionMode;
  pendingInteraction?: PendingInteraction;
  createdAt: string;
}

export interface ToolInvocation {
  tool: string;
  toolUseId: string;
  input: string;
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string; toolUseId: string; input: string };

export interface AskUserAnswerData {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string; markdown?: string }>;
    multiSelect: boolean;
  }>;
  answers: Record<string, string>;
}

export interface Attachment {
  id: string;
  filename: string;
  mediaType: string;
  /** Relative path from conversation dir to the attachment file */
  path: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  thinking?: string;
  toolInvocations?: ToolInvocation[];
  /** Ordered content parts preserving interleaving of text and tool invocations */
  parts?: MessagePart[];
  askUserAnswers?: AskUserAnswerData;
  attachments?: Attachment[];
  ts: string;
}

const SERVITOR_DIR = '.servitor';
const CONVERSATION_DIR = 'conversation';

function conversationDir(worktreePath: string): string {
  return join(worktreePath, SERVITOR_DIR, CONVERSATION_DIR);
}

function metaPath(worktreePath: string): string {
  return join(conversationDir(worktreePath), 'meta.json');
}

function messagesPath(worktreePath: string): string {
  return join(conversationDir(worktreePath), 'messages.jsonl');
}

/** Lazily create the conversation directory + meta.json if missing. */
export function ensureConversation(worktreePath: string): ConversationMeta {
  const dir = conversationDir(worktreePath);
  const mp = metaPath(worktreePath);

  if (existsSync(mp)) {
    return JSON.parse(readFileSync(mp, 'utf-8')) as ConversationMeta;
  }

  mkdirSync(dir, { recursive: true });

  const meta: ConversationMeta = {
    title: 'Conversation',
    agentType: 'claude-code',
    createdAt: new Date().toISOString()
  };

  writeFileSync(mp, JSON.stringify(meta, null, '\t') + '\n');
  return meta;
}

export function getConversationMeta(worktreePath: string): ConversationMeta | undefined {
  const mp = metaPath(worktreePath);
  if (!existsSync(mp)) return undefined;

  try {
    return JSON.parse(readFileSync(mp, 'utf-8')) as ConversationMeta;
  } catch {
    return undefined;
  }
}

export function loadMessages(worktreePath: string): Message[] {
  const path = messagesPath(worktreePath);
  if (!existsSync(path)) return [];

  const content = readFileSync(path, 'utf-8').trim();
  if (!content) return [];

  return content
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Message];
      } catch {
        return [];
      }
    });
}

export function appendMessage(worktreePath: string, msg: Message): void {
  const dir = conversationDir(worktreePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  appendFileSync(messagesPath(worktreePath), JSON.stringify(msg) + '\n');
}

export function updateConversationMeta(
  worktreePath: string,
  updates: Partial<Pick<ConversationMeta, 'agentSessionId' | 'executionMode'>>
): void {
  const meta = getConversationMeta(worktreePath);
  if (!meta) return;

  const updated = { ...meta, ...updates };
  writeFileSync(metaPath(worktreePath), JSON.stringify(updated, null, '\t') + '\n');
}

export function setPendingInteraction(worktreePath: string, interaction: PendingInteraction): void {
  const meta = getConversationMeta(worktreePath);
  if (!meta) return;

  writeFileSync(
    metaPath(worktreePath),
    JSON.stringify({ ...meta, pendingInteraction: interaction }, null, '\t') + '\n'
  );
}

export function clearPendingInteraction(worktreePath: string): void {
  const meta = getConversationMeta(worktreePath);
  if (!meta) return;

  const { pendingInteraction: _, ...rest } = meta;
  writeFileSync(metaPath(worktreePath), JSON.stringify(rest, null, '\t') + '\n');
}

/** Save a base64-encoded attachment to disk, return metadata for JSONL storage. */
export function saveAttachment(
  worktreePath: string,
  filename: string,
  mediaType: string,
  base64Data: string
): Attachment {
  const id = randomUUID();
  const ext = filename.split('.').pop() || 'bin';
  const storedName = `${id}.${ext}`;
  const relPath = `attachments/${storedName}`;
  const absDir = join(conversationDir(worktreePath), 'attachments');
  mkdirSync(absDir, { recursive: true });
  writeFileSync(join(absDir, storedName), Buffer.from(base64Data, 'base64'));
  return { id, filename, mediaType, path: relPath };
}

/** Read an attachment file back as base64. */
export function readAttachmentBase64(worktreePath: string, attachment: Attachment): string {
  const absPath = join(conversationDir(worktreePath), attachment.path);
  return readFileSync(absPath).toString('base64');
}

/** Get the absolute filesystem path for an attachment. */
export function getAttachmentAbsPath(worktreePath: string, attachment: Attachment): string {
  return join(conversationDir(worktreePath), attachment.path);
}
