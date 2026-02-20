# @hmans/servitor

## 0.3.1

### Patch Changes

- 08b4a1a: Include yaml package in runtime dependencies

## 0.3.0

### Minor Changes

- 306b8bb: Add `servitor init` command that scaffolds `.servitor/` directory and `.servitor.yml` config
- dd6f0ff: Add permanent main branch workspace for running tasks directly on the main branch

### Patch Changes

- 79039e6: Use port from `.servitor.yml` for the Vite dev server
- 14c2b42: Fix message rendering to preserve interleaved ordering of text and tool invocations

  Text and tool invocations within an assistant turn are now stored as ordered `parts` and rendered in their original sequence, both during streaming and after persistence. Previously all tool invocations were grouped together before the text content.

- adf6e06: Fix publish workflow to create GitHub Releases via changesets action

## 0.2.0

### Minor Changes

- 26c5db7: feat: add pino logging with request logging hooks and graceful shutdown

### Patch Changes

- 3775356: Replace manual argv parsing with commander.js for CLI argument handling
- 4bdf9e5: refactor: replace BrailleSpinner with ServitorBit as persistent activity indicator
- 1ed9a82: fix: disable CSRF origin check to fix 403 on workspace creation in production mode
- a38eeca: fix: use `browser` guard for localStorage access to prevent SSR crash
- d8962a9: Switch indentation from tabs to 2-space spaces

## 0.1.3

### Patch Changes

- 46c6a47: Fix CI publish pipeline for OIDC trusted publishing

## 0.1.2

### Patch Changes

- 3711423: Test bump
