---
# serv-auj6
title: Project management
status: completed
type: feature
priority: normal
created_at: 2026-02-14T12:09:20Z
updated_at: 2026-02-14T12:33:39Z
parent: serv-u79y
---

Full CRUD for projects with UI.

## Requirements
- Create project: form with name + repo path, validate that path is a git repo
- List projects: shown in sidebar (loaded from layout server)
- Project detail page: shows project info + list of workspaces
- Edit project: rename, change path
- Delete project: confirm dialog, cleans up associated workspaces

## Tasks
- [x] Server: project CRUD (SvelteKit form actions)
- [x] Create project form + validation
- [x] Project detail page at /projects/[id]
- [x] Edit/delete functionality
- [x] Sidebar integration (projects load in layout)
