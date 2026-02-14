---
# serv-81hb
title: App shell and navigation
status: completed
type: task
priority: normal
created_at: 2026-02-14T12:09:13Z
updated_at: 2026-02-14T12:32:22Z
parent: serv-1x2z
---

Set up the base app layout: sidebar + main content area.

## Requirements
- Sidebar: project list, each project expandable to show workspaces
- Main content area: routed content (project detail, workspace detail, chat)
- Clean, minimal styling (Tailwind is already set up)
- SvelteKit layout routes: `/projects`, `/projects/[id]`, `/projects/[id]/workspaces/[wsId]`

## Tasks
- [x] Create root layout with sidebar + main area
- [x] Set up route structure
- [x] Sidebar component with project listing
- [x] Basic navigation between views
