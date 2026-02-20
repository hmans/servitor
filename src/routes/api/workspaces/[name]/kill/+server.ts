import { json, error } from '@sveltejs/kit';
import { killProcess, isProcessing } from '$lib/server/agents/manager';

export function POST({ params }) {
  const managerKey = params.name;

  if (!isProcessing(managerKey)) {
    error(404, 'No active process for this workspace');
  }

  killProcess(managerKey);
  return json({ killed: true });
}
