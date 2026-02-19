---
# serv-8bbq
title: Remove SQLite — derive state from git + filesystem
status: completed
type: feature
priority: normal
created_at: 2026-02-15T22:05:50Z
updated_at: 2026-02-17T12:19:53Z
---

Replace SQLite/Drizzle storage with git worktree parsing for workspaces and JSONL files for conversations/messages. Remove better-sqlite3, drizzle-orm, drizzle-kit deps.

## Tasks
- [x] Create src/lib/server/workspaces.ts (git worktree parsing)
- [x] Create src/lib/server/conversations.ts (JSONL storage)
- [x] Rename route [id] to [name] and rewrite page routes
- [x] Move API routes to /api/workspaces/[name]/conversations/[convId]/*
- [x] Update Sidebar and page components
- [x] Remove DB infrastructure (files, deps, scripts)
- [x] Update .gitignore and CLAUDE.md

## Summary of Changes

Replaced SQLite/Drizzle storage with git worktree parsing for workspaces and JSONL files for conversations/messages. Removed better-sqlite3, drizzle-orm, drizzle-kit, and @types/better-sqlite3 dependencies. Deleted src/lib/server/db/, drizzle.config.ts, and local.db. Created workspaces.ts and conversations.ts as the new storage layer. Moved routes from [id] to [name] and restructured API routes under /api/workspaces/[name]/conversations/[convId]/*. Updated all components for the new data shapes.
