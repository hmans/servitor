---
# serv-thbz
title: Workspace Actions
status: draft
type: epic
created_at: 2026-02-14T12:09:01Z
updated_at: 2026-02-14T12:09:01Z
parent: serv-c2rd
blocked_by:
    - serv-i5r9
---

Configurable action buttons on workspaces based on git/GitHub state.

## Scope
- Action button framework: contextual buttons that appear based on workspace state
- Git actions: commit & push
- GitHub actions: open PR, update PR, review, merge PR
- Uses `gh` CLI under the hood
- User-configurable (which buttons appear, in what order)

## Notes
This is post-MVP. Deferring until core chat flow works end-to-end.
