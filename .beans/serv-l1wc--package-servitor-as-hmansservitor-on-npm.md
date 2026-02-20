---
# serv-l1wc
title: Package Servitor as @hmans/servitor on NPM
status: completed
type: task
priority: normal
created_at: 2026-02-20T10:58:28Z
updated_at: 2026-02-20T11:05:57Z
---

Publish to NPM so users can run `npx @hmans/servitor` from any git repo.

## Tasks
- [x] Switch from adapter-auto to adapter-node
- [x] Move all dependencies to devDependencies (bundled at build time)
- [x] Create bin/servitor.js CLI entry point
- [x] Update package.json for publishing (name, bin, files, engines, version)
- [x] Build and verify

## Summary of Changes

- Switched from `adapter-auto` to `adapter-node` for self-contained Node.js build output
- Moved all `dependencies` to `devDependencies` so Rollup bundles everything (zero runtime deps)
- Created `bin/servitor.js` CLI entry point with subcommand routing, `--port`/`--host` flags
- Updated `package.json`: renamed to `@hmans/servitor`, v0.1.0, added `bin`/`files`/`engines` fields
- Build produces 2.5 MB tarball with only `build/` and `bin/`
