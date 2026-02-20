import { error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import { subscribe, isProcessing } from '$lib/server/agents/manager';
import { createSSEResponse } from '$lib/server/sse';

export function GET({ params, request }) {
  const ws = getWorkspace(params.name);
  if (!ws) error(404, 'Workspace not found');

  const managerKey = params.name;

  return createSSEResponse(request, (send) => {
    send('connected', { workspace: managerKey, processing: isProcessing(managerKey) });

    return subscribe(managerKey, (event) => {
      send(event.type, event);
    });
  });
}
