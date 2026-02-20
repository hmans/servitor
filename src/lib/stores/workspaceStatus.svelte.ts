let _statuses: Record<string, boolean> = $state({});
let _eventSource: EventSource | null = null;

function connect() {
  if (_eventSource) return;

  const es = new EventSource('/api/status/stream');

  es.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data);
    _statuses = data.statuses;
  });

  es.addEventListener('status', (e) => {
    const data = JSON.parse(e.data);
    _statuses = { ..._statuses, [data.workspace]: data.busy };
  });

  _eventSource = es;
}

function disconnect() {
  _eventSource?.close();
  _eventSource = null;
  _statuses = {};
}

export const workspaceStatus = {
  get statuses() {
    return _statuses;
  },
  isBusy(workspace: string): boolean {
    return _statuses[workspace] ?? false;
  },
  connect,
  disconnect
};
