---
# serv-hv9e
title: Sidebar workspace status indicators
status: completed
type: feature
priority: normal
created_at: 2026-02-19T21:52:23Z
updated_at: 2026-02-19T21:54:45Z
---

Add real-time green/gray status dots to sidebar workspaces showing which agents are busy/idle, via a global SSE endpoint.

## Tasks

- [x] Add global status subscription API to agent manager
- [x] Create `/api/status/stream` SSE endpoint
- [x] Create `workspaceStatus` client-side reactive store
- [x] Wire up store lifecycle in layout
- [x] Render status dots in sidebar

## Summary of Changes

Added real-time workspace status indicators (green/gray dots) to the sidebar.

### New files
- `src/routes/api/status/stream/+server.ts` — Global SSE endpoint that broadcasts workspace busy/idle transitions to all connected clients
- `src/lib/stores/workspaceStatus.svelte.ts` — Svelte 5 reactive singleton store that manages the EventSource connection and exposes `isBusy(workspace)`

### Modified files
- `src/lib/server/agents/manager.ts` — Added global status listener infrastructure (`subscribeGlobalStatus`, `getAllStatuses`, `broadcastStatus`) with broadcast calls at all four process lifecycle transitions (spawn, done, blocking tool kill, manual kill)
- `src/routes/+layout.svelte` — Connects/disconnects the workspace status store on mount
- `src/lib/components/Sidebar.svelte` — Renders a 6px green/gray dot before each workspace name
