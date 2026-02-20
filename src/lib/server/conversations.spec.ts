import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import {
  ensureConversation,
  getConversationMeta,
  loadMessages,
  appendMessage,
  updateConversationMeta,
  setPendingInteraction,
  clearPendingInteraction
} from './conversations';
import type { ConversationMeta, Message } from './conversations';

vi.mock('fs');

const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedAppendFileSync = vi.mocked(appendFileSync);

const WORKTREE = '/tmp/test-worktree';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureConversation', () => {
  it('returns existing meta when meta.json exists', () => {
    const meta: ConversationMeta = {
      title: 'Test',
      agentType: 'claude-code',
      createdAt: '2024-01-01T00:00:00.000Z'
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(meta));

    const result = ensureConversation(WORKTREE);
    expect(result).toEqual(meta);
    expect(mockedMkdirSync).not.toHaveBeenCalled();
  });

  it('creates directory and meta.json when missing', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = ensureConversation(WORKTREE);

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.servitor/conversation'),
      { recursive: true }
    );
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('meta.json'),
      expect.stringContaining('"title": "Conversation"')
    );
    expect(result.title).toBe('Conversation');
    expect(result.agentType).toBe('claude-code');
    expect(result.createdAt).toBeTruthy();
  });
});

describe('getConversationMeta', () => {
  it('returns undefined when meta.json does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    expect(getConversationMeta(WORKTREE)).toBeUndefined();
  });

  it('returns parsed meta when file exists', () => {
    const meta: ConversationMeta = {
      title: 'Test',
      agentType: 'claude-code',
      createdAt: '2024-01-01T00:00:00.000Z'
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(meta));

    expect(getConversationMeta(WORKTREE)).toEqual(meta);
  });

  it('returns undefined on JSON parse error', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('not json');

    expect(getConversationMeta(WORKTREE)).toBeUndefined();
  });
});

describe('loadMessages', () => {
  it('returns empty array when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    expect(loadMessages(WORKTREE)).toEqual([]);
  });

  it('returns empty array for empty file', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('');

    expect(loadMessages(WORKTREE)).toEqual([]);
  });

  it('returns empty array for whitespace-only file', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('   \n  \n  ');

    expect(loadMessages(WORKTREE)).toEqual([]);
  });

  it('parses valid JSONL messages', () => {
    const msg1: Message = { role: 'user', content: 'hello', ts: '2024-01-01T00:00:00Z' };
    const msg2: Message = {
      role: 'assistant',
      content: 'hi there',
      ts: '2024-01-01T00:00:01Z'
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(msg1) + '\n' + JSON.stringify(msg2));

    const messages = loadMessages(WORKTREE);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(msg1);
    expect(messages[1]).toEqual(msg2);
  });

  it('silently skips malformed JSON lines', () => {
    const valid: Message = { role: 'user', content: 'ok', ts: '2024-01-01T00:00:00Z' };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('not valid json\n' + JSON.stringify(valid) + '\n{broken');

    const messages = loadMessages(WORKTREE);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(valid);
  });

  it('handles trailing newline', () => {
    const msg: Message = { role: 'user', content: 'test', ts: '2024-01-01T00:00:00Z' };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(msg) + '\n');

    const messages = loadMessages(WORKTREE);
    expect(messages).toHaveLength(1);
  });
});

describe('appendMessage', () => {
  it('creates directory if missing and appends message', () => {
    mockedExistsSync.mockReturnValue(false);

    const msg: Message = { role: 'user', content: 'hello', ts: '2024-01-01T00:00:00Z' };
    appendMessage(WORKTREE, msg);

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.servitor/conversation'),
      { recursive: true }
    );
    expect(mockedAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('messages.jsonl'),
      JSON.stringify(msg) + '\n'
    );
  });

  it('skips mkdir when directory exists', () => {
    mockedExistsSync.mockReturnValue(true);

    const msg: Message = { role: 'user', content: 'hello', ts: '2024-01-01T00:00:00Z' };
    appendMessage(WORKTREE, msg);

    expect(mockedMkdirSync).not.toHaveBeenCalled();
    expect(mockedAppendFileSync).toHaveBeenCalled();
  });
});

describe('updateConversationMeta', () => {
  it('does nothing when meta does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    updateConversationMeta(WORKTREE, { agentSessionId: 'sess-1' });

    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('merges updates into existing meta', () => {
    const meta: ConversationMeta = {
      title: 'Test',
      agentType: 'claude-code',
      createdAt: '2024-01-01T00:00:00.000Z'
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(meta));

    updateConversationMeta(WORKTREE, { agentSessionId: 'sess-1' });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.agentSessionId).toBe('sess-1');
    expect(written.title).toBe('Test');
  });
});

describe('setPendingInteraction', () => {
  it('does nothing when meta does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    setPendingInteraction(WORKTREE, { type: 'enter_plan' });

    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('adds pendingInteraction to meta', () => {
    const meta: ConversationMeta = {
      title: 'Test',
      agentType: 'claude-code',
      createdAt: '2024-01-01T00:00:00.000Z'
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(meta));

    setPendingInteraction(WORKTREE, { type: 'enter_plan' });

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.pendingInteraction).toEqual({ type: 'enter_plan' });
    expect(written.title).toBe('Test');
  });
});

describe('clearPendingInteraction', () => {
  it('does nothing when meta does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    clearPendingInteraction(WORKTREE);

    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('removes pendingInteraction from meta', () => {
    const meta: ConversationMeta = {
      title: 'Test',
      agentType: 'claude-code',
      pendingInteraction: { type: 'enter_plan' },
      createdAt: '2024-01-01T00:00:00.000Z'
    };

    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(meta));

    clearPendingInteraction(WORKTREE);

    const written = JSON.parse(mockedWriteFileSync.mock.calls[0][1] as string);
    expect(written.pendingInteraction).toBeUndefined();
    expect(written.title).toBe('Test');
  });
});
