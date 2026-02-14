---
# serv-p7zj
title: Workspace management
status: completed
type: feature
priority: normal
created_at: 2026-02-14T12:09:25Z
updated_at: 2026-02-14T12:34:54Z
parent: serv-i5r9
---

Create and manage workspaces (git worktrees) within a project.

## Requirements
- Create workspace: pick a name, Servitor creates a branch + git worktree
- Branch naming: `servitor/<workspace-name>` by default
- Worktree path: configurable or auto-derived (e.g. `<repo>/.worktrees/<name>`)
- List workspaces in project detail page
- Workspace detail page: shows conversations as tabs
- Delete workspace: remove worktree, optionally delete branch

## Tasks
- [x] Server: git worktree create/delete (shell out to git)
- [x] Server: workspace CRUD (form actions)
- [x] Create workspace form
- [x] Workspace list in project detail page
- [x] Workspace detail page at /projects/[id]/workspaces/[wsId]
- [x] Worktree cleanup on delete
