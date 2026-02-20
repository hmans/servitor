import type { AgentEvent } from './types';

/**
 * Parse Claude Code CLI stream-json events into our normalized events.
 *
 * Claude Code CLI emits these top-level types:
 * - "system" (subtypes: hook_started, hook_response, init) — skip
 * - "assistant" — contains message.content with text/tool_use blocks
 * - "result" — final result with full text
 */
export function parseClaudeEvent(data: Record<string, unknown>, sessionId: string): AgentEvent[] {
  const events: AgentEvent[] = [];

  if (data.type === 'assistant') {
    const message = data.message as Record<string, unknown> | undefined;
    const content = (message?.content ?? []) as Array<Record<string, unknown>>;

    for (const block of content) {
      if (block.type === 'thinking' && typeof block.thinking === 'string') {
        events.push({ type: 'thinking', text: block.thinking });
      }
      if (block.type === 'text' && typeof block.text === 'string') {
        events.push({ type: 'text_delta', text: block.text });
      }
      if (block.type === 'tool_use') {
        const input = block.input as Record<string, unknown> | undefined;

        if (block.name === 'EnterPlanMode') {
          events.push({
            type: 'enter_plan',
            toolUseId: block.id as string,
            sessionId
          });
        } else if (block.name === 'AskUserQuestion') {
          const questions = (input?.questions ?? []) as Array<{
            question: string;
            header: string;
            options: Array<{ label: string; description: string; markdown?: string }>;
            multiSelect: boolean;
          }>;
          events.push({
            type: 'ask_user',
            toolUseId: block.id as string,
            questions,
            sessionId
          });
        } else if (block.name === 'ExitPlanMode') {
          events.push({
            type: 'exit_plan',
            toolUseId: block.id as string,
            allowedPrompts: input?.allowedPrompts as
              | Array<{ tool: string; prompt: string }>
              | undefined,
            sessionId
          });
        } else {
          events.push({
            type: 'tool_use_start',
            tool: block.name as string,
            toolUseId: block.id as string,
            input: summarizeToolInput(block.name as string, input)
          });
        }
      }
    }
  }

  if (data.type === 'result') {
    events.push({
      type: 'message_complete',
      text: (data.result as string) ?? '',
      sessionId: (data.session_id as string) ?? sessionId
    });
  }

  return events;
}

/** Extract a short human-readable summary of what a tool is doing */
export function summarizeToolInput(tool: string, input?: Record<string, unknown>): string {
  if (!input) return '';

  switch (tool) {
    case 'Read':
      return (input.file_path as string) ?? '';
    case 'Write':
      return (input.file_path as string) ?? '';
    case 'Edit':
      return (input.file_path as string) ?? '';
    case 'Bash':
      return (input.command as string) ?? '';
    case 'Glob':
      return (input.pattern as string) ?? '';
    case 'Grep':
      return (input.pattern as string) ?? '';
    case 'WebFetch':
      return (input.url as string) ?? '';
    case 'WebSearch':
      return (input.query as string) ?? '';
    case 'Task':
      return (input.description as string) ?? '';
    case 'TodoWrite':
    case 'TaskCreate':
      return (input.subject as string) ?? '';
    case 'TaskUpdate':
      return `${(input.taskId as string) ?? ''} → ${(input.status as string) ?? ''}`;
    case 'TaskGet':
    case 'TaskList':
      return (input.taskId as string) ?? '';
    default:
      return '';
  }
}
