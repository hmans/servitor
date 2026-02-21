---
# serv-yzg2
title: Add svelte-check to CI
status: completed
type: task
priority: normal
created_at: 2026-02-21T10:12:16Z
updated_at: 2026-02-21T10:13:21Z
---

Fix 5 pre-existing type errors and re-add pnpm check to CI/publish workflows

## Summary of Changes

- Deleted stale `src/routes/page.svelte.spec.ts` (root page now redirects, spec tested removed props)
- Fixed type error in `manager.spec.ts:158` — widened event array type to include `message?` field
- Fixed implicit `any` in `manager.spec.ts:243` — typed destructured mock call args
- Added `pnpm check` step to `.github/workflows/ci.yml` and `publish.yml` before unit tests
- Verified: 0 errors, 0 warnings, 162 tests pass
