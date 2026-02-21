import { json, error } from '@sveltejs/kit';
import { killProcess, isProcessing } from '$lib/server/agents/manager';
import { getWorkspace } from '$lib/server/workspaces';
import { appendMessage, clearPendingInteraction } from '$lib/server/conversations';

export function POST({ params }) {
  const managerKey = params.name;

  if (!isProcessing(managerKey)) {
    error(404, 'No active process for this workspace');
  }

  killProcess(managerKey);

  // Persist a message so the interruption is visible in conversation history
  const ws = getWorkspace(params.name);
  if (ws) {
    clearPendingInteraction(ws.worktreePath);
    appendMessage(ws.worktreePath, {
      role: 'system',
      content: 'Stopped by user',
      ts: new Date().toISOString()
    });
  }

  return json({ killed: true });
}
