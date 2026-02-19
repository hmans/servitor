---
# serv-iv3z
title: Extract shared SSE stream utility from duplicate endpoint boilerplate
status: completed
type: task
priority: normal
created_at: 2026-02-19T22:12:57Z
updated_at: 2026-02-19T22:14:01Z
---

Both status/stream and workspaces/[name]/stream have nearly identical SSE setup — encoder, send() helper, heartbeat interval, cleanup logic, same response headers. Extract into a shared utility.

## Summary of Changes

Extracted a `createSSEResponse` utility into `src/lib/server/sse.ts` that encapsulates the shared SSE boilerplate:
- TextEncoder + send() helper with try/catch
- Heartbeat interval (15s) with try/catch
- request.signal abort listener
- cleanup logic
- Standard SSE response headers

Both endpoints (`/api/status/stream` and `/api/workspaces/[name]/stream`) now use `createSSEResponse(request, setup)`, where the setup callback receives a `send` function and returns an optional teardown function. Each endpoint went from ~55-63 lines to ~10-17 lines.
