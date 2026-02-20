# @hmans/servitor

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
