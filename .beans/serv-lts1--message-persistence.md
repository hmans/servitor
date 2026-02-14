---
# serv-lts1
title: Message persistence
status: completed
type: task
priority: normal
created_at: 2026-02-14T12:09:55Z
updated_at: 2026-02-14T13:58:17Z
parent: serv-6zn7
---

Persist all conversation messages to SQLite as they flow through.

## Requirements
- Store each message (user and assistant) in the messages table as it arrives
- On page load, hydrate conversation from DB (show history)
- Handle streaming: assistant messages may arrive as chunks — store the final assembled message
- Store tool use/result messages for full conversation replay

## Tasks
- [x] Server-side: persist user messages on send
- [x] Server-side: persist assistant messages on stream completion
- [ ] Server-side: persist tool use/result messages (deferred)
- [x] Load conversation history on page navigation
- [x] Handle message ordering and timestamps
