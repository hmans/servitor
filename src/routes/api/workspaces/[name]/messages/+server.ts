import { json, error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import {
  ensureConversation,
  appendMessage,
  updateConversationMeta,
  clearPendingInteraction,
  saveAttachment,
  readAttachmentBase64,
  type Attachment
} from '$lib/server/conversations';
import { sendMessage } from '$lib/server/agents/manager';
import type { MessageContent, ContentBlock } from '$lib/server/agents/types';

export async function POST({ params, request }) {
  const ws = getWorkspace(params.name);
  if (!ws) error(404, 'Workspace not found');

  const conv = ensureConversation(ws.worktreePath);

  const body = await request.json();
  const content = body.content?.trim() || '';
  const rawAttachments = body.attachments as
    | Array<{ filename: string; mediaType: string; data: string }>
    | undefined;

  if (!content && !rawAttachments?.length) error(400, 'Content is required');

  const ts = new Date().toISOString();

  // Save attachments to disk
  let attachments: Attachment[] | undefined;
  if (rawAttachments?.length) {
    attachments = rawAttachments.map((a) =>
      saveAttachment(ws.worktreePath, a.filename, a.mediaType, a.data)
    );
  }

  // Persist user message (metadata only, no base64 in JSONL)
  const msg: Parameters<typeof appendMessage>[1] = {
    role: 'user',
    content,
    attachments: attachments?.length ? attachments : undefined,
    ts
  };
  if (body.askUserAnswers) {
    msg.askUserAnswers = body.askUserAnswers;
  }
  appendMessage(ws.worktreePath, msg);

  // Clear any pending interaction (ask_user / exit_plan) since the user is responding
  clearPendingInteraction(ws.worktreePath);

  // Agent manager key — just the workspace name
  const managerKey = params.name;

  // Build agent content: plain string or content block array with images
  let agentContent: MessageContent = content;
  if (attachments?.length) {
    const blocks: ContentBlock[] = [];
    if (content) blocks.push({ type: 'text', text: content });
    for (const att of attachments) {
      const base64 = readAttachmentBase64(ws.worktreePath, att);
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: att.mediaType, data: base64 }
      });
    }
    agentContent = blocks;
  }

  // Send to agent
  sendMessage(managerKey, {
    messageId: ts,
    content: agentContent,
    agentType: conv.agentType,
    cwd: ws.worktreePath,
    sessionId: conv.agentSessionId,
    executionMode: conv.executionMode ?? 'build',
    onComplete: (text, sessionId, toolInvocations, thinking, parts) => {
      // Persist assistant message
      if (text || thinking || toolInvocations.length > 0) {
        appendMessage(ws.worktreePath, {
          role: 'assistant',
          content: text,
          thinking: thinking || undefined,
          toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
          parts: parts.length > 0 ? parts : undefined,
          ts: new Date().toISOString()
        });
      }

      // Update session ID for future turns
      if (sessionId && sessionId !== conv.agentSessionId) {
        updateConversationMeta(ws.worktreePath, { agentSessionId: sessionId });
      }
    }
  });

  return json({ ok: true });
}
