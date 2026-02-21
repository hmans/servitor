import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent, AgentProcess } from './types';

// --- Mocks (must be set up before importing the module under test) ---

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '# Plan content')
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const mockSetPendingInteraction = vi.fn();
vi.mock('$lib/server/conversations', () => ({
  setPendingInteraction: (...args: unknown[]) => mockSetPendingInteraction(...args)
}));

/**
 * Creates a fake AgentProcess where we control which events are emitted.
 * Call `emit(event)` to simulate the CLI producing an event.
 */
function createMockProcess() {
  let eventCallback: ((event: AgentEvent) => void) | null = null;
  const process: AgentProcess = {
    send: vi.fn(),
    sendToolResult: vi.fn(),
    onEvent(cb) {
      eventCallback = cb;
    },
    kill: vi.fn()
  };
  return {
    process,
    emit(event: AgentEvent) {
      if (!eventCallback) throw new Error('No event callback registered');
      eventCallback(event);
    }
  };
}

// Mock the ClaudeCodeAdapter to return our controllable process
let currentMockProcess: ReturnType<typeof createMockProcess>;
vi.mock('./claude-code', () => ({
  ClaudeCodeAdapter: class {
    start() {
      currentMockProcess = createMockProcess();
      return currentMockProcess.process;
    }
  }
}));

// Import after mocks are set up
import {
  sendMessage,
  subscribe,
  killProcess,
  killAll,
  isProcessing,
  getAllStatuses,
  subscribeGlobalStatus
} from './manager';

// --- Helpers ---

function defaultOpts(overrides?: Record<string, unknown>) {
  return {
    messageId: 'msg-1',
    content: 'Hello',
    agentType: 'claude-code',
    cwd: '/fake/workspace',
    executionMode: 'build' as const,
    onComplete: vi.fn(),
    ...overrides
  };
}

/** Send a message and return the mock process + collected events. */
function setupConversation(id = 'test-ws', overrides?: Record<string, unknown>) {
  const events: AgentEvent[] = [];
  const unsub = subscribe(id, (e) => {
    if (e.type !== 'user_message') events.push(e as AgentEvent);
  });
  const opts = defaultOpts(overrides);
  sendMessage(id, opts);
  return { opts, events, unsub, mock: currentMockProcess };
}

// --- Tests ---

describe('agent manager', () => {
  beforeEach(() => {
    killAll();
    vi.clearAllMocks();
  });

  describe('subscribe / unsubscribe', () => {
    it('broadcasts user_message to listeners on send', () => {
      const events: Array<{ type: string }> = [];
      const unsub = subscribe('ws-1', (e) => events.push(e));
      sendMessage('ws-1', defaultOpts());
      unsub();

      expect(events[0]).toEqual({
        type: 'user_message',
        messageId: 'msg-1',
        content: 'Hello'
      });
    });

    it('stops receiving events after unsubscribe', () => {
      const events: Array<{ type: string }> = [];
      const unsub = subscribe('ws-1', (e) => events.push(e));
      unsub();

      sendMessage('ws-1', defaultOpts());
      // The send still happens internally, but our listener shouldn't fire
      // (the user_message broadcast goes to 0 listeners now, plus the adapter listener)
      expect(events).toHaveLength(0);
    });
  });

  describe('process lifecycle', () => {
    it('spawns a process on first message', () => {
      const { mock } = setupConversation();
      expect(mock.process.send).toHaveBeenCalledWith('Hello');
    });

    it('reuses existing process for subsequent messages', () => {
      const { mock } = setupConversation();
      const firstProcess = mock.process;

      // Send a second message into the same conversation
      sendMessage('test-ws', defaultOpts({ messageId: 'msg-2', content: 'Second' }));

      // Should reuse, not spawn a new process
      expect(firstProcess.send).toHaveBeenCalledWith('Second');
    });

    it('sets busy state on send', () => {
      setupConversation();
      expect(isProcessing('test-ws')).toBe(true);
    });

    it('clears busy state on message_complete', () => {
      const { mock } = setupConversation();
      mock.emit({ type: 'message_complete', text: 'Done', sessionId: 'ses-1' });
      expect(isProcessing('test-ws')).toBe(false);
    });

    it('clears busy state on done', () => {
      const { mock } = setupConversation();
      mock.emit({ type: 'done', sessionId: 'ses-1' });
      expect(isProcessing('test-ws')).toBe(false);
    });

    it('emits error for unknown agent type', () => {
      const events: Array<{ type: string; message?: string }> = [];
      subscribe('ws-err', (e) => events.push(e));
      sendMessage('ws-err', defaultOpts({ agentType: 'nonexistent' }));

      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.message).toContain('nonexistent');
    });
  });

  describe('turn accumulation', () => {
    it('accumulates text_delta into turnParts', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Hello' });
      mock.emit({ type: 'text_delta', text: 'Hello world' });
      mock.emit({ type: 'message_complete', text: '', sessionId: 'ses-1' });

      expect(opts.onComplete).toHaveBeenCalledOnce();
      const [text, , , , parts] = opts.onComplete.mock.calls[0];
      // text_delta consolidates — should be one text part with the latest value
      expect(text).toBe('Hello world');
      expect(parts).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('accumulates tool_use_start into turnParts and toolInvocations', () => {
      const { mock, opts } = setupConversation();

      mock.emit({
        type: 'tool_use_start',
        tool: 'Read',
        toolUseId: 'tu-1',
        input: '/src/main.ts'
      });
      mock.emit({ type: 'message_complete', text: '', sessionId: 'ses-1' });

      const [, , toolInvocations, , parts] = opts.onComplete.mock.calls[0];
      expect(toolInvocations).toEqual([
        { tool: 'Read', toolUseId: 'tu-1', input: '/src/main.ts' }
      ]);
      expect(parts).toEqual([
        { type: 'tool_use', tool: 'Read', toolUseId: 'tu-1', input: '/src/main.ts' }
      ]);
    });

    it('preserves interleaving of text and tool_use parts', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Let me read' });
      mock.emit({
        type: 'tool_use_start',
        tool: 'Read',
        toolUseId: 'tu-1',
        input: 'file.ts'
      });
      mock.emit({ type: 'text_delta', text: 'Here is the content' });
      mock.emit({ type: 'message_complete', text: '', sessionId: 'ses-1' });

      const [, , , , parts] = opts.onComplete.mock.calls[0];
      expect(parts).toEqual([
        { type: 'text', text: 'Let me read' },
        { type: 'tool_use', tool: 'Read', toolUseId: 'tu-1', input: 'file.ts' },
        { type: 'text', text: 'Here is the content' }
      ]);
    });

    it('accumulates thinking text', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'thinking', text: 'Hmm...' });
      mock.emit({ type: 'text_delta', text: 'Answer' });
      mock.emit({ type: 'message_complete', text: '', sessionId: 'ses-1' });

      const [, , , thinking] = opts.onComplete.mock.calls[0];
      expect(thinking).toBe('Hmm...');
    });

    it('consolidates consecutive text_delta into one part', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'A' });
      mock.emit({ type: 'text_delta', text: 'AB' });
      mock.emit({ type: 'text_delta', text: 'ABC' });
      mock.emit({ type: 'message_complete', text: '', sessionId: 'ses-1' });

      const [, , , , parts] = opts.onComplete.mock.calls[0] as [string, string, unknown[], string, Array<{ type: string; text?: string }>];
      // All three deltas should consolidate into one text part
      expect(parts.filter((p) => p.type === 'text')).toHaveLength(1);
      expect(parts[0]).toEqual({ type: 'text', text: 'ABC' });
    });

    it('resets turn state between messages', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'First answer' });
      mock.emit({ type: 'message_complete', text: 'First answer', sessionId: 'ses-1' });

      // Send second message — turn state should be reset
      const onComplete2 = vi.fn();
      sendMessage('test-ws', defaultOpts({ messageId: 'msg-2', content: 'Second', onComplete: onComplete2 }));

      mock.emit({ type: 'text_delta', text: 'Second answer' });
      mock.emit({ type: 'message_complete', text: 'Second answer', sessionId: 'ses-1' });

      // First turn persisted correctly
      expect(opts.onComplete).toHaveBeenCalledOnce();
      expect(opts.onComplete.mock.calls[0][0]).toBe('First answer');

      // Second turn should only contain second answer
      expect(onComplete2).toHaveBeenCalledOnce();
      expect(onComplete2.mock.calls[0][0]).toBe('Second answer');
    });
  });

  describe('message_complete / flushTurn', () => {
    it('uses event.text as override when present', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Accumulated' });
      mock.emit({ type: 'message_complete', text: 'Final result', sessionId: 'ses-1' });

      expect(opts.onComplete.mock.calls[0][0]).toBe('Final result');
    });

    it('falls back to accumulated text when event.text is empty', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Accumulated text' });
      mock.emit({ type: 'message_complete', text: '', sessionId: 'ses-1' });

      expect(opts.onComplete.mock.calls[0][0]).toBe('Accumulated text');
    });

    it('does not call onComplete when there is no accumulated content', () => {
      const { mock, opts } = setupConversation();

      // message_complete with no prior content
      mock.emit({ type: 'message_complete', text: '', sessionId: 'ses-1' });

      expect(opts.onComplete).not.toHaveBeenCalled();
    });

    it('persists session ID from message_complete', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Hi' });
      mock.emit({ type: 'message_complete', text: 'Hi', sessionId: 'ses-42' });

      expect(opts.onComplete.mock.calls[0][1]).toBe('ses-42');
    });

    it('resets turn state after flush', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'First' });
      mock.emit({
        type: 'tool_use_start',
        tool: 'Bash',
        toolUseId: 'tu-1',
        input: 'ls'
      });
      mock.emit({ type: 'thinking', text: 'Thinking...' });
      mock.emit({ type: 'message_complete', text: 'First', sessionId: 'ses-1' });

      // Start a new turn and complete immediately — should have no leftover state
      const onComplete2 = vi.fn();
      sendMessage('test-ws', defaultOpts({ messageId: 'msg-2', onComplete: onComplete2 }));
      mock.emit({ type: 'message_complete', text: '', sessionId: 'ses-1' });

      // No content accumulated = onComplete should not fire
      expect(onComplete2).not.toHaveBeenCalled();
    });
  });

  describe('blocking tools', () => {
    it('persists partial message and kills process on ask_user', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Let me ask...' });
      mock.emit({
        type: 'ask_user',
        toolUseId: 'tu-ask',
        questions: [
          {
            question: 'Which option?',
            header: 'Choice',
            options: [{ label: 'A', description: 'Option A' }],
            multiSelect: false
          }
        ],
        sessionId: 'ses-1'
      });

      // Partial message should be persisted
      expect(opts.onComplete).toHaveBeenCalledOnce();
      expect(opts.onComplete.mock.calls[0][0]).toBe('Let me ask...');

      // Process should be killed
      expect(mock.process.kill).toHaveBeenCalled();
      expect(isProcessing('test-ws')).toBe(false);

      // Pending interaction should be set
      expect(mockSetPendingInteraction).toHaveBeenCalledWith('/fake/workspace', {
        type: 'ask_user',
        questions: expect.any(Array)
      });
    });

    it('persists partial message and kills process on enter_plan', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Planning...' });
      mock.emit({ type: 'enter_plan', toolUseId: 'tu-plan', sessionId: 'ses-1' });

      expect(opts.onComplete).toHaveBeenCalledOnce();
      expect(mock.process.kill).toHaveBeenCalled();
      expect(mockSetPendingInteraction).toHaveBeenCalledWith('/fake/workspace', {
        type: 'enter_plan'
      });
    });

    it('persists partial message and kills process on exit_plan', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Done planning' });
      mock.emit({
        type: 'exit_plan',
        toolUseId: 'tu-exit',
        sessionId: 'ses-1',
        allowedPrompts: [{ tool: 'Bash', prompt: 'run tests' }]
      });

      expect(opts.onComplete).toHaveBeenCalledOnce();
      expect(mock.process.kill).toHaveBeenCalled();
      expect(mockSetPendingInteraction).toHaveBeenCalledWith('/fake/workspace', {
        type: 'exit_plan',
        allowedPrompts: [{ tool: 'Bash', prompt: 'run tests' }],
        planContent: undefined,
        planFilePath: undefined
      });
    });

    it('broadcasts blocking tool event to listeners', () => {
      const { mock, events } = setupConversation();

      mock.emit({
        type: 'ask_user',
        toolUseId: 'tu-ask',
        questions: [],
        sessionId: 'ses-1'
      });

      const askEvent = events.find((e) => e.type === 'ask_user');
      expect(askEvent).toBeDefined();
    });

    it('does not persist if no content accumulated before blocking tool', () => {
      const { mock, opts } = setupConversation();

      // Blocking tool immediately — no text, no tools
      mock.emit({ type: 'enter_plan', toolUseId: 'tu-plan', sessionId: 'ses-1' });

      expect(opts.onComplete).not.toHaveBeenCalled();
      expect(mock.process.kill).toHaveBeenCalled();
    });
  });

  describe('killProcess', () => {
    it('persists in-flight content before killing', () => {
      const { mock, opts } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'Working on it...' });
      mock.emit({
        type: 'tool_use_start',
        tool: 'Bash',
        toolUseId: 'tu-1',
        input: 'npm test'
      });

      killProcess('test-ws');

      // Partial content should be persisted
      expect(opts.onComplete).toHaveBeenCalledOnce();
      const [text, , toolInvocations, , parts] = opts.onComplete.mock.calls[0];
      expect(text).toBe('Working on it...');
      expect(toolInvocations).toHaveLength(1);
      expect(parts).toHaveLength(2);

      // Process should be killed
      expect(mock.process.kill).toHaveBeenCalled();
      expect(isProcessing('test-ws')).toBe(false);
    });

    it('does not persist if no content accumulated', () => {
      const { mock, opts } = setupConversation();

      killProcess('test-ws');

      expect(opts.onComplete).not.toHaveBeenCalled();
      expect(mock.process.kill).toHaveBeenCalled();
    });

    it('is a no-op for unknown conversation', () => {
      expect(() => killProcess('nonexistent')).not.toThrow();
    });
  });

  describe('global status', () => {
    it('broadcasts busy state changes', () => {
      const statusEvents: Array<{ workspace: string; busy: boolean }> = [];
      const unsub = subscribeGlobalStatus((e) => statusEvents.push(e));

      const { mock } = setupConversation('ws-status');

      // Should have broadcast busy=true on send
      expect(statusEvents).toContainEqual({ workspace: 'ws-status', busy: true });

      mock.emit({ type: 'message_complete', text: 'Done', sessionId: 'ses-1' });

      // Should have broadcast busy=false on complete
      expect(statusEvents).toContainEqual({ workspace: 'ws-status', busy: false });

      unsub();
    });

    it('getAllStatuses returns current state', () => {
      setupConversation('ws-a');
      setupConversation('ws-b');

      const statuses = getAllStatuses();
      expect(statuses['ws-a']).toBe(true);
      expect(statuses['ws-b']).toBe(true);
    });
  });

  describe('done event cleanup', () => {
    it('clears turn state on done', () => {
      const { mock } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'orphaned' });
      mock.emit({
        type: 'tool_use_start',
        tool: 'Read',
        toolUseId: 'tu-1',
        input: 'file.ts'
      });
      mock.emit({ type: 'done', sessionId: 'ses-1' });

      // Start a new conversation in the same workspace
      const onComplete2 = vi.fn();
      sendMessage('test-ws', defaultOpts({ messageId: 'msg-2', onComplete: onComplete2 }));

      // Complete immediately — should have no leftover content
      currentMockProcess.emit({ type: 'message_complete', text: '', sessionId: 'ses-2' });

      expect(onComplete2).not.toHaveBeenCalled();
    });
  });

  describe('event broadcasting', () => {
    it('broadcasts text_delta events to listeners', () => {
      const { mock, events } = setupConversation();
      mock.emit({ type: 'text_delta', text: 'Hello' });
      expect(events).toContainEqual({ type: 'text_delta', text: 'Hello' });
    });

    it('broadcasts tool_use_start events to listeners', () => {
      const { mock, events } = setupConversation();
      mock.emit({
        type: 'tool_use_start',
        tool: 'Read',
        toolUseId: 'tu-1',
        input: '/file.ts'
      });
      expect(events).toContainEqual({
        type: 'tool_use_start',
        tool: 'Read',
        toolUseId: 'tu-1',
        input: '/file.ts'
      });
    });

    it('broadcasts thinking events to listeners', () => {
      const { mock, events } = setupConversation();
      mock.emit({ type: 'thinking', text: 'Hmm...' });
      expect(events).toContainEqual({ type: 'thinking', text: 'Hmm...' });
    });

    it('broadcasts message_complete events to listeners', () => {
      const { mock, events } = setupConversation();
      mock.emit({ type: 'message_complete', text: 'Done', sessionId: 'ses-1' });
      expect(events).toContainEqual({
        type: 'message_complete',
        text: 'Done',
        sessionId: 'ses-1'
      });
    });

    it('broadcasts done events to listeners', () => {
      const { mock, events } = setupConversation();
      mock.emit({ type: 'done', sessionId: 'ses-1' });
      expect(events).toContainEqual({ type: 'done', sessionId: 'ses-1' });
    });

    it('broadcasts error events to listeners', () => {
      const { mock, events } = setupConversation();
      mock.emit({ type: 'error', message: 'Something broke' });
      expect(events).toContainEqual({ type: 'error', message: 'Something broke' });
    });
  });

  describe('session ID handling', () => {
    it('seeds lastSessionId from opts on first send', () => {
      const { mock, opts } = setupConversation('ws-session', { sessionId: 'initial-ses' });

      mock.emit({ type: 'text_delta', text: 'Hi' });
      mock.emit({ type: 'message_complete', text: 'Hi', sessionId: '' });

      // Should use the seeded session ID when message_complete has empty one
      expect(opts.onComplete.mock.calls[0][1]).toBe('initial-ses');
    });

    it('updates sessionId from message_complete', () => {
      const { mock } = setupConversation();

      mock.emit({ type: 'text_delta', text: 'First' });
      mock.emit({ type: 'message_complete', text: 'First', sessionId: 'ses-new' });

      // Kill and verify a resume would use the new session ID
      // We can check this by sending another message and verifying the process.send is called
      // (process reuse, so the session is tracked internally)
      const onComplete2 = vi.fn();
      sendMessage('test-ws', defaultOpts({ messageId: 'msg-2', onComplete: onComplete2 }));

      mock.emit({ type: 'text_delta', text: 'Second' });
      mock.emit({ type: 'message_complete', text: 'Second', sessionId: '' });

      // Empty sessionId in event should fall back to the stored one
      expect(onComplete2.mock.calls[0][1]).toBe('ses-new');
    });
  });
});
