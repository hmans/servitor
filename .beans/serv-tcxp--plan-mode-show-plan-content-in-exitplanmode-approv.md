---
# serv-tcxp
title: 'Plan Mode: show plan content in ExitPlanMode approval UI'
status: completed
type: feature
priority: normal
created_at: 2026-02-19T20:02:00Z
updated_at: 2026-02-19T20:04:55Z
---

When Claude calls ExitPlanMode, we kill the process and show [approve]/[reject] buttons — but we never show the actual plan content. Need to:

- [x] Scan tool invocations for Write calls to ~/.claude/plans/*.md
- [x] Read the plan file from disk when ExitPlanMode fires
- [x] Add planContent/planFilePath to exit_plan event and PendingInteraction types
- [x] Render plan content as markdown in the approval card
- [x] Persist plan content so it survives page reloads

## Summary of Changes

When Claude calls ExitPlanMode, we now:
1. Snapshot tool invocations before persisting the partial message
2. Scan for Write calls to ~/.claude/plans/*.md (searching from the end)
3. Read the plan file content from disk
4. Attach planContent and planFilePath to both the SSE event and persisted PendingInteraction
5. Render the plan as markdown in a collapsible details element within the approval card
6. Show the plan file path for reference
7. Plan content survives page reloads via meta.json persistence

Files modified:
- types.ts — added planContent/planFilePath to exit_plan event
- conversations.ts — added planContent/planFilePath to PendingInteraction
- manager.ts — snapshot tool invocations, find plan file, read content, attach to event
- +page.svelte — render plan markdown in approval card with collapsible details
