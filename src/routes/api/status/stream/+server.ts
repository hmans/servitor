import { subscribeGlobalStatus, getAllStatuses } from '$lib/server/agents/manager';
import { createSSEResponse } from '$lib/server/sse';

export function GET({ request }) {
  return createSSEResponse(request, (send) => {
    send('connected', { statuses: getAllStatuses() });

    return subscribeGlobalStatus((status) => {
      send('status', status);
    });
  });
}
