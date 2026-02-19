---
# serv-yt97
title: Fix five low-hanging fruit issues
status: completed
type: task
priority: normal
created_at: 2026-02-19T22:24:02Z
updated_at: 2026-02-19T22:24:47Z
---

Fix five small issues found during codebase audit: (1) stopProcess missing activity.setBusy(false), (2) loadMessages crash on partial JSONL, (3) duplicate ToolInvocation interface, (4) dead lastPulse variable, (5) PaneResizer missing ARIA values

## Summary of Changes

1. **stopProcess() missing activity.setBusy(false)** — Added `activity.setBusy(false)` call in `stopProcess()` so Bit stops glowing when the user kills the agent process.
2. **loadMessages() crash on partial JSONL** — Wrapped `JSON.parse` in try/catch so a partial last line (from mid-write kill) is silently skipped instead of crashing the page.
3. **Duplicate ToolInvocation interface** — Removed the duplicate declaration from `manager.ts` and re-exported the canonical one from `conversations.ts`.
4. **Dead lastPulse variable** — Removed unused `let lastPulse = 0` from `ServitorBit.svelte`.
5. **PaneResizer missing ARIA values** — Added `aria-valuenow`, `aria-valuemin`, `aria-valuemax` to the focusable separator for screen reader compliance.
