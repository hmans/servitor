---
# serv-66sk
title: Add execution modes (plan/build/yolo) for agent processes
status: completed
type: feature
priority: normal
created_at: 2026-02-19T20:09:22Z
updated_at: 2026-02-19T20:15:18Z
---

Add user-controlled execution modes that map to Claude Code CLI permission flags:

- plan → --permission-mode plan (read-only, forces planning)
- build → --permission-mode acceptEdits (can edit, asks about destructive ops)  
- yolo → --dangerously-skip-permissions (auto-approve everything)

Implementation:
- [x] Add ExecutionMode type and to ConversationMeta
- [x] Add executionMode to AgentStartConfig
- [x] Map modes to CLI flags in ClaudeCodeAdapter
- [x] Pass execution mode through messages endpoint → manager → adapter
- [x] API endpoint to change mode (kills running process)
- [x] Auto-switch plan → build on plan approval
- [x] UI mode selector in workspace header
- [x] Pass current mode to client

## Summary of Changes

Added execution modes that control how the Claude Code CLI runs:
- plan → --permission-mode plan (read-only)
- build → --permission-mode acceptEdits
- yolo → --dangerously-skip-permissions (default)

Mode stored in conversation meta.json, passed through the full chain.
Changing mode kills any running process.
Plan approval auto-switches plan → build.
