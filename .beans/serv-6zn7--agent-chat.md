---
# serv-6zn7
title: Agent Chat
status: in-progress
type: epic
priority: normal
created_at: 2026-02-14T12:08:55Z
updated_at: 2026-02-14T12:34:54Z
parent: serv-c2rd
blocked_by:
    - serv-i5r9
---

Agent conversation system — adapter abstraction, Claude Code integration, server-to-client streaming, chat UI, message persistence.

## Scope
- Agent adapter interface: abstraction over different CLI agents (Claude Code, Codex, etc.)
- Claude Code adapter: spawn process, parse JSON streaming output, relay user input via stdin
- Server-to-client streaming: SSE or WebSocket endpoint
- Chat UI: tabbed conversations within a workspace, message bubbles, streaming responses, user input
- Persistence: store all messages in SQLite as they arrive
