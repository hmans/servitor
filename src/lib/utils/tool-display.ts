export function toolIcon(tool: string): string {
  switch (tool) {
    case 'Read':
      return 'icon-[uil--eye]';
    case 'Write':
      return 'icon-[uil--file-plus]';
    case 'Edit':
      return 'icon-[uil--pen]';
    case 'Bash':
      return 'icon-[uil--wrench]';
    case 'Glob':
      return 'icon-[uil--search]';
    case 'Grep':
      return 'icon-[uil--search-alt]';
    case 'WebFetch':
    case 'WebSearch':
      return 'icon-[uil--globe]';
    case 'Task':
      return 'icon-[uil--wrench]';
    case 'TodoWrite':
    case 'TaskCreate':
      return 'icon-[uil--clipboard-notes]';
    case 'TaskUpdate':
    case 'TaskGet':
    case 'TaskList':
      return 'icon-[uil--clipboard]';
    default:
      return 'icon-[uil--wrench]';
  }
}

export function humanizeToolUse(tool: string, toolInput: string): string {
  switch (tool) {
    case 'Read':
      return toolInput ? `Reading ${toolInput}` : 'Reading a file';
    case 'Write':
      return toolInput ? `Writing ${toolInput}` : 'Writing a file';
    case 'Edit':
      return toolInput ? `Editing ${toolInput}` : 'Editing a file';
    case 'Bash':
      return toolInput ? `Running \`${toolInput}\`` : 'Running a command';
    case 'Glob':
      return toolInput ? `Finding files matching ${toolInput}` : 'Finding files';
    case 'Grep':
      return toolInput ? `Searching for "${toolInput}"` : 'Searching code';
    case 'WebFetch':
      return toolInput ? `Fetching ${toolInput}` : 'Fetching a URL';
    case 'WebSearch':
      return toolInput ? `Searching the web for "${toolInput}"` : 'Searching the web';
    case 'Task':
      return toolInput ? `Spawning task: ${toolInput}` : 'Spawning a sub-task';
    case 'TodoWrite':
    case 'TaskCreate':
      return toolInput ? `Added todo: ${toolInput}` : 'Added a todo';
    case 'TaskUpdate':
      return toolInput ? `Updating task ${toolInput}` : 'Updating a task';
    case 'TaskGet':
      return toolInput ? `Checking task ${toolInput}` : 'Checking a task';
    case 'TaskList':
      return 'Listing tasks';
    default:
      return toolInput ? `${tool} ${toolInput}` : tool;
  }
}
