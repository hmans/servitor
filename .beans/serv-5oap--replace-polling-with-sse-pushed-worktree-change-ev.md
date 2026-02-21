---
# serv-5oap
title: Replace polling with SSE-pushed worktree change events
status: completed
type: feature
priority: normal
created_at: 2026-02-21T08:02:23Z
updated_at: 2026-02-21T08:03:50Z
---

Replace the 1-second setInterval polling with fs.watch-based filesystem watching that pushes worktree_changed events through the existing SSE stream. Eliminates ~10 unnecessary git subprocess calls per second.

## Tasks

- [x] Create `src/lib/server/worktree-watcher.ts` — fs.watch with debounce, filtering, ref-counted subscriptions
- [x] Modify SSE endpoint to subscribe to worktree watcher alongside agent manager
- [x] Remove polling from `+layout.svelte`
- [x] Add `worktree_changed` listener and `visibilitychange` catch-up in `+page.svelte`
- [x] Add `closeAllWatchers()` to shutdown hook
- [x] Create changeset
- [x] Verify tests pass


## Summary of Changes

Replaced the 1-second `setInterval` polling in workspace layouts with filesystem-watching via Node's `fs.watch` (recursive). Changes are debounced (300ms) and pushed as `worktree_changed` events through the existing SSE stream. The client listens for these events and calls `invalidateAll()` only when something actually changed, plus catches up on missed changes when the tab becomes visible.

- **New**: `src/lib/server/worktree-watcher.ts` — reference-counted per-worktree watchers with debounce and path filtering (.git, .servitor, editor temps)
- **Modified**: SSE endpoint subscribes to both agent manager and worktree watcher
- **Modified**: `+layout.svelte` — removed polling interval
- **Modified**: `+page.svelte` — added `worktree_changed` and `visibilitychange` listeners
- **Modified**: `hooks.server.ts` — added `closeAllWatchers()` to shutdown
