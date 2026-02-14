---
# serv-v223
title: Database schema
status: completed
type: task
priority: normal
created_at: 2026-02-14T12:09:09Z
updated_at: 2026-02-14T12:32:22Z
parent: serv-1x2z
---

Design and implement the Drizzle schema for all core entities.

## Tables
- `project` — id, name, repoPath, createdAt, updatedAt
- `workspace` — id, projectId (FK), name, branch, worktreePath, status (active/archived), createdAt, updatedAt
- `conversation` — id, workspaceId (FK), title, agentType (claude-code, codex, etc.), createdAt, updatedAt
- `message` — id, conversationId (FK), role (user/assistant/system/tool), content (JSON), createdAt

## Tasks
- [x] Replace placeholder task table with real schema
- [x] Generate and run initial migration (used db:push)
- [x] Verify with drizzle-kit push
