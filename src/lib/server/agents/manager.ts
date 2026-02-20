import { readFileSync } from 'fs';
import { ClaudeCodeAdapter } from './claude-code';
import type {
  AgentAdapter,
  AgentEvent,
  AgentProcess,
  ExecutionMode,
  MessageContent
} from './types';
import { setPendingInteraction, type ToolInvocation } from '$lib/server/conversations';
import { logger } from '../logger';

export type { ToolInvocation };

export type ConversationEvent =
  | { type: 'user_message'; messageId: string; content: string }
  | AgentEvent;

type Listener = (event: ConversationEvent) => void;

interface ActiveConversation {
  process: AgentProcess | null;
  listeners: Set<Listener>;
  agentType: string;
  cwd: string;
  /** Tool calls accumulated during the current turn */
  toolInvocations: ToolInvocation[];
  /** Text accumulated during the current turn */
  turnText: string;
  /** Thinking text accumulated during the current turn */
  turnThinking: string;
  /** Callback for each completed turn — persists assistant message + session ID */
  onComplete:
    | ((
        text: string,
        sessionId: string,
        toolInvocations: ToolInvocation[],
        thinking: string
      ) => void)
    | null;
  /** Last known session ID for resumption */
  lastSessionId: string;
  /** True while the agent is actively doing a turn (between send and message_complete/done) */
  busy: boolean;
}

const adapters: Record<string, AgentAdapter> = {
  'claude-code': new ClaudeCodeAdapter()
};

const active = new Map<string, ActiveConversation>();

// Global status listeners — notified when any workspace's busy state changes
type GlobalStatusListener = (event: { workspace: string; busy: boolean }) => void;
const globalStatusListeners = new Set<GlobalStatusListener>();

function broadcastStatus(workspace: string, busy: boolean) {
  for (const fn of globalStatusListeners) {
    fn({ workspace, busy });
  }
}

export function subscribeGlobalStatus(listener: GlobalStatusListener): () => void {
  globalStatusListeners.add(listener);
  return () => {
    globalStatusListeners.delete(listener);
  };
}

export function getAllStatuses(): Record<string, boolean> {
  const statuses: Record<string, boolean> = {};
  for (const [id, conv] of active) {
    statuses[id] = conv.busy;
  }
  return statuses;
}

function getOrCreate(conversationId: string): ActiveConversation {
  let conv = active.get(conversationId);
  if (!conv) {
    conv = {
      process: null,
      listeners: new Set(),
      agentType: '',
      cwd: '',
      toolInvocations: [],
      turnText: '',
      turnThinking: '',
      onComplete: null,
      lastSessionId: '',
      busy: false
    };
    active.set(conversationId, conv);
  }
  return conv;
}

export function subscribe(conversationId: string, listener: Listener): () => void {
  const conv = getOrCreate(conversationId);
  conv.listeners.add(listener);

  return () => {
    conv.listeners.delete(listener);
    if (conv.listeners.size === 0 && !conv.process) {
      active.delete(conversationId);
    }
  };
}

export function sendMessage(
  conversationId: string,
  opts: {
    messageId: string;
    content: MessageContent;
    agentType: string;
    cwd: string;
    sessionId?: string;
    executionMode: ExecutionMode;
    onComplete: (
      text: string,
      sessionId: string,
      toolInvocations: ToolInvocation[],
      thinking: string
    ) => void;
  }
): void {
  const conv = getOrCreate(conversationId);

  // Emit user message text to all subscribers immediately
  const textContent =
    typeof opts.content === 'string'
      ? opts.content
      : opts.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { text: string }).text)
          .join('\n');
  for (const fn of conv.listeners) {
    fn({ type: 'user_message', messageId: opts.messageId, content: textContent });
  }

  // Reset turn state for this new turn
  conv.toolInvocations = [];
  conv.turnText = '';
  conv.turnThinking = '';

  // Update the onComplete callback (the messages endpoint passes a fresh one each time
  // that closes over the correct conversation row)
  conv.onComplete = opts.onComplete;

  // Seed lastSessionId from conversation meta if we don't have one in memory
  if (!conv.lastSessionId && opts.sessionId) {
    conv.lastSessionId = opts.sessionId;
  }

  conv.busy = true;
  broadcastStatus(conversationId, true);

  // If we already have a running process, just send the message into it
  if (conv.process) {
    conv.process.send(opts.content);
    return;
  }

  // Spawn a new persistent process
  const adapter = adapters[opts.agentType];
  if (!adapter) {
    for (const fn of conv.listeners) {
      fn({ type: 'error', message: `Unknown agent type: ${opts.agentType}` });
    }
    return;
  }

  conv.agentType = opts.agentType;
  conv.cwd = opts.cwd;

  const process = adapter.start({
    cwd: opts.cwd,
    sessionId: conv.lastSessionId || undefined,
    executionMode: opts.executionMode
  });
  conv.process = process;

  process.onEvent((event) => {
    // Accumulate text and thinking for the current turn
    if (event.type === 'text_delta') {
      conv.turnText = event.text; // text_delta contains full accumulated text, not a delta
    }
    if (event.type === 'thinking') {
      conv.turnThinking = event.text; // accumulated (not delta)
    }

    // Kill the process immediately when a blocking tool is detected.
    // The user will answer via the UI and a new process will be
    // spawned with --resume.
    if (event.type === 'enter_plan' || event.type === 'ask_user' || event.type === 'exit_plan') {
      conv.lastSessionId = event.sessionId;

      // Snapshot tool invocations before persisting (which resets the array)
      const turnToolInvocations = [...conv.toolInvocations];

      // Persist partial assistant message if there's accumulated content
      if ((conv.turnText || conv.toolInvocations.length > 0) && conv.onComplete) {
        conv.onComplete(conv.turnText, event.sessionId, conv.toolInvocations, conv.turnThinking);
        conv.toolInvocations = [];
        conv.turnText = '';
        conv.turnThinking = '';
      }

      // Persist the pending interaction so it survives page reloads
      if (event.type === 'enter_plan') {
        setPendingInteraction(conv.cwd, { type: 'enter_plan' });
      } else if (event.type === 'ask_user') {
        setPendingInteraction(conv.cwd, { type: 'ask_user', questions: event.questions });
      } else {
        // Find the plan file from tool invocations (Write to ~/.claude/plans/*.md)
        const planFilePath = findPlanFilePath(turnToolInvocations);
        let planContent: string | undefined;
        if (planFilePath) {
          try {
            planContent = readFileSync(planFilePath, 'utf-8');
          } catch {
            // Plan file may not exist yet or be unreadable
          }
        }

        // Attach plan content to the event before broadcasting
        event = { ...event, planContent, planFilePath };

        setPendingInteraction(conv.cwd, {
          type: 'exit_plan',
          allowedPrompts: event.allowedPrompts,
          planContent,
          planFilePath
        });
      }

      conv.busy = false;

      // Broadcast the event first so the UI can show the interaction
      for (const fn of conv.listeners) {
        fn(event);
      }
      // Then kill the process
      conv.process?.kill();
      conv.process = null;
      broadcastStatus(conversationId, false);
      return;
    }

    // Accumulate tool invocations before broadcasting so state is
    // consistent if a listener inspects conv.toolInvocations.
    if (event.type === 'tool_use_start') {
      conv.toolInvocations.push({
        tool: event.tool,
        toolUseId: event.toolUseId,
        input: event.input
      });
    }

    for (const fn of conv.listeners) {
      fn(event);
    }

    if (event.type === 'message_complete') {
      conv.busy = false;
      broadcastStatus(conversationId, false);
      conv.lastSessionId = event.sessionId || conv.lastSessionId;
      if (conv.onComplete) {
        // The result event's text field may be empty — fall back to accumulated turnText
        const finalText = event.text || conv.turnText;
        conv.onComplete(finalText, event.sessionId, conv.toolInvocations, conv.turnThinking);
        conv.toolInvocations = [];
        conv.turnText = '';
        conv.turnThinking = '';
      }
    }

    if (event.type === 'done') {
      conv.busy = false;
      conv.process = null;
      broadcastStatus(conversationId, false);
    }
  });

  // Send the first message
  process.send(opts.content);
}

export function isProcessing(conversationId: string): boolean {
  return active.get(conversationId)?.busy ?? false;
}

/** Return a debug snapshot of all active conversations */
export function debugState(): Array<{
  conversationId: string;
  hasProcess: boolean;
  listeners: number;
}> {
  return [...active.entries()].map(([id, conv]) => ({
    conversationId: id,
    hasProcess: conv.process != null,
    listeners: conv.listeners.size
  }));
}

export function killProcess(conversationId: string): void {
  const conv = active.get(conversationId);
  if (conv?.process) {
    conv.process.kill();
    conv.process = null;
    broadcastStatus(conversationId, false);
  }
}

/** Kill all active agent processes (for graceful shutdown) */
export function killAll(): void {
  for (const [id, conv] of active) {
    if (conv.process) {
      logger.info({ workspace: id }, 'Killing agent process');
      conv.process.kill();
      conv.process = null;
    }
  }
  active.clear();
}

/** Scan tool invocations for a Write to ~/.claude/plans/*.md and return the file path */
function findPlanFilePath(toolInvocations: ToolInvocation[]): string | undefined {
  for (let i = toolInvocations.length - 1; i >= 0; i--) {
    const t = toolInvocations[i];
    if (t.tool === 'Write' && t.input.includes('/.claude/plans/') && t.input.endsWith('.md')) {
      return t.input;
    }
  }
  return undefined;
}
