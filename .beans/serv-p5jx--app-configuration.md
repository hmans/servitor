---
# serv-p5jx
title: App configuration
status: completed
type: task
priority: normal
created_at: 2026-02-14T20:29:42Z
updated_at: 2026-02-14T20:35:10Z
---

Add a configuration file for Servitor with configurable paths.

## Requirements
- JSON config file (servitor.json) in project root
- Configurable worktrees directory (default: $HOME/servitor-worktrees)
- Move worktree creation out of the project repo into the configured directory
- Structure: <worktreesDir>/<project-slug>/<workspace-name>

## Tasks
- [x] Create config module (src/lib/server/config.ts)
- [x] Create default servitor.json
- [x] Update git.ts to use configured worktrees dir
- [x] Update workspace creation to use new paths

## Summary of Changes

- Created `src/lib/server/config.ts`: loads config from `servitor.json` (overridable via `SERVITOR_CONFIG` env var), defaults `worktreesDir` to `$HOME/servitor-worktrees`
- Created `servitor.json` with default `worktreesDir: ~/servitor-worktrees`
- Updated `src/lib/server/git.ts`: `createWorktree` now takes `worktreesDir` and `projectSlug` params, creates worktrees at `<worktreesDir>/<projectSlug>/<workspaceName>`, ensures parent dirs exist. Added `slugify()` helper.
- Updated workspace creation route to wire config and slug through to `createWorktree`
