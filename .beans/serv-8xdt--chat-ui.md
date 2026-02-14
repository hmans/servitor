---
# serv-8xdt
title: Chat UI
status: todo
type: feature
created_at: 2026-02-14T12:09:50Z
updated_at: 2026-02-14T12:09:50Z
parent: serv-6zn7
---

The conversation interface — where the user talks to agents.

## Requirements
- Tabbed conversations within a workspace
- Message display: user messages, assistant responses (with markdown rendering), tool use indicators
- Streaming: assistant messages appear token-by-token as they stream in
- Input: text area at the bottom, send on Enter (shift+Enter for newline)
- Auto-scroll to bottom on new messages
- Visual distinction between message roles

## Tasks
- [ ] Conversation tab bar component
- [ ] Message list component (scrollable, auto-scroll)
- [ ] Message bubble component (role-aware styling)
- [ ] Markdown rendering for assistant messages
- [ ] User input component (textarea + send)
- [ ] Wire up to streaming endpoint
- [ ] Create new conversation button/flow
