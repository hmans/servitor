---
# serv-ahit
title: Server-to-client streaming
status: completed
type: task
priority: normal
created_at: 2026-02-14T12:09:45Z
updated_at: 2026-02-14T13:58:17Z
parent: serv-6zn7
---

Set up real-time streaming from server (agent process) to browser client.

## Options
- **SSE (Server-Sent Events)**: simpler, one-directional (server→client), user messages go via POST. Good enough for MVP.
- **WebSocket**: bidirectional, more complex setup in SvelteKit. Better for interactive feel.

## Recommendation
Start with SSE for MVP — user sends messages via POST to a form action/API route, agent output streams back via SSE. Upgrade to WebSocket later if needed.

## Tasks
- [x] Decided SSE for MVP
- [x] Implement streaming endpoint: GET /api/conversations/[id]/stream
- [x] Implement message send endpoint: POST /api/conversations/[id]/messages
- [x] Client-side EventSource connection in Svelte
- [x] Reconnection handling (EventSource auto-reconnects)
