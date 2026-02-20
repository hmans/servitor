let _pulseCount = $state(0);
let _busy = $state(false);
let _toolEmojiId = $state(0);
let _toolEmoji = $state('');

const toolEmojiMap: Record<string, string> = {
  Read: '📖',
  Write: '✏️',
  Edit: '✏️',
  Bash: '💻',
  Grep: '🔍',
  Glob: '📂',
  WebSearch: '🌐',
  WebFetch: '🌐',
  Task: '🤖',
  NotebookEdit: '📓'
};

export const activity = {
  get pulseCount() {
    return _pulseCount;
  },
  get busy() {
    return _busy;
  },
  get toolEmojiId() {
    return _toolEmojiId;
  },
  get toolEmoji() {
    return _toolEmoji;
  },
  pulse() {
    _pulseCount++;
  },
  setBusy(value: boolean) {
    _busy = value;
  },
  emitToolEmoji(toolName: string) {
    _toolEmoji = toolEmojiMap[toolName] ?? '🔧';
    _toolEmojiId++;
  }
};
