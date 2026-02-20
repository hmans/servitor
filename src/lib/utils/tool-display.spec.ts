import { describe, it, expect } from 'vitest';
import { toolIcon, humanizeToolUse } from './tool-display';

describe('toolIcon', () => {
  it('returns eye icon for Read', () => {
    expect(toolIcon('Read')).toBe('icon-[uil--eye]');
  });

  it('returns file-plus icon for Write', () => {
    expect(toolIcon('Write')).toBe('icon-[uil--file-plus]');
  });

  it('returns pen icon for Edit', () => {
    expect(toolIcon('Edit')).toBe('icon-[uil--pen]');
  });

  it('returns wrench icon for Bash', () => {
    expect(toolIcon('Bash')).toBe('icon-[uil--wrench]');
  });

  it('returns search icon for Glob', () => {
    expect(toolIcon('Glob')).toBe('icon-[uil--search]');
  });

  it('returns search-alt icon for Grep', () => {
    expect(toolIcon('Grep')).toBe('icon-[uil--search-alt]');
  });

  it('returns globe icon for WebFetch and WebSearch', () => {
    expect(toolIcon('WebFetch')).toBe('icon-[uil--globe]');
    expect(toolIcon('WebSearch')).toBe('icon-[uil--globe]');
  });

  it('returns clipboard-notes icon for TodoWrite and TaskCreate', () => {
    expect(toolIcon('TodoWrite')).toBe('icon-[uil--clipboard-notes]');
    expect(toolIcon('TaskCreate')).toBe('icon-[uil--clipboard-notes]');
  });

  it('returns clipboard icon for TaskUpdate, TaskGet, TaskList', () => {
    expect(toolIcon('TaskUpdate')).toBe('icon-[uil--clipboard]');
    expect(toolIcon('TaskGet')).toBe('icon-[uil--clipboard]');
    expect(toolIcon('TaskList')).toBe('icon-[uil--clipboard]');
  });

  it('returns wrench icon for unknown tools', () => {
    expect(toolIcon('SomeUnknownTool')).toBe('icon-[uil--wrench]');
  });
});

describe('humanizeToolUse', () => {
  it('humanizes Read with input', () => {
    expect(humanizeToolUse('Read', 'src/index.ts')).toBe('Reading src/index.ts');
  });

  it('humanizes Read without input', () => {
    expect(humanizeToolUse('Read', '')).toBe('Reading a file');
  });

  it('humanizes Write', () => {
    expect(humanizeToolUse('Write', 'out.txt')).toBe('Writing out.txt');
    expect(humanizeToolUse('Write', '')).toBe('Writing a file');
  });

  it('humanizes Edit', () => {
    expect(humanizeToolUse('Edit', 'app.ts')).toBe('Editing app.ts');
    expect(humanizeToolUse('Edit', '')).toBe('Editing a file');
  });

  it('humanizes Bash with backticks', () => {
    expect(humanizeToolUse('Bash', 'npm test')).toBe('Running `npm test`');
    expect(humanizeToolUse('Bash', '')).toBe('Running a command');
  });

  it('humanizes Glob', () => {
    expect(humanizeToolUse('Glob', '**/*.ts')).toBe('Finding files matching **/*.ts');
    expect(humanizeToolUse('Glob', '')).toBe('Finding files');
  });

  it('humanizes Grep', () => {
    expect(humanizeToolUse('Grep', 'TODO')).toBe('Searching for "TODO"');
    expect(humanizeToolUse('Grep', '')).toBe('Searching code');
  });

  it('humanizes WebFetch', () => {
    expect(humanizeToolUse('WebFetch', 'https://example.com')).toBe('Fetching https://example.com');
    expect(humanizeToolUse('WebFetch', '')).toBe('Fetching a URL');
  });

  it('humanizes WebSearch', () => {
    expect(humanizeToolUse('WebSearch', 'svelte 5')).toBe('Searching the web for "svelte 5"');
    expect(humanizeToolUse('WebSearch', '')).toBe('Searching the web');
  });

  it('humanizes Task', () => {
    expect(humanizeToolUse('Task', 'analyze code')).toBe('Spawning task: analyze code');
    expect(humanizeToolUse('Task', '')).toBe('Spawning a sub-task');
  });

  it('humanizes TodoWrite and TaskCreate', () => {
    expect(humanizeToolUse('TodoWrite', 'fix bug')).toBe('Added todo: fix bug');
    expect(humanizeToolUse('TaskCreate', 'fix bug')).toBe('Added todo: fix bug');
    expect(humanizeToolUse('TaskCreate', '')).toBe('Added a todo');
  });

  it('humanizes TaskUpdate', () => {
    expect(humanizeToolUse('TaskUpdate', '#3')).toBe('Updating task #3');
    expect(humanizeToolUse('TaskUpdate', '')).toBe('Updating a task');
  });

  it('humanizes TaskGet', () => {
    expect(humanizeToolUse('TaskGet', '#1')).toBe('Checking task #1');
    expect(humanizeToolUse('TaskGet', '')).toBe('Checking a task');
  });

  it('humanizes TaskList', () => {
    expect(humanizeToolUse('TaskList', '')).toBe('Listing tasks');
    expect(humanizeToolUse('TaskList', 'anything')).toBe('Listing tasks');
  });

  it('falls back to tool name for unknown tools', () => {
    expect(humanizeToolUse('Custom', 'arg')).toBe('Custom arg');
    expect(humanizeToolUse('Custom', '')).toBe('Custom');
  });
});
