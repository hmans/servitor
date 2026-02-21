# @hmans/servitor

## 0.5.0

### Minor Changes

- f521c68: Add light mode with theme toggle in sidebar
- 3996913: Remove typewriter effect, add message fade transitions, fix tool ordering in non-verbose mode
- 8308950: Replace 1-second polling with fs.watch-based SSE events for worktree status updates
- 989e4ab: Add persisted "Stopped by user" system message when killing agent, fix stop button visibility during send, and reduce composer top padding

### Patch Changes

- d203d6d: Add svelte-check to CI, fix pre-existing type errors
- 4833ce8: Fix text overflow in tool invocation displays by adding truncation
- 1baecdb: Eliminate flash when agent turn completes by promoting streaming content to local message synchronously
- b09bbd5: Persist partial assistant message when user stops the agent mid-turn, use filled stop icon for "Stopped by user" message
- 85ea27a: Use push/mutation on $state arrays instead of replacing them on every SSE event
- 41e6c24: Refactor message handling: extract shared types, deduplicate fetch logic, consolidate streaming events, simplify agent state machine
- 870fdae: Replace SSE addEventListener monkey-patch with typed listenSSE helper, use timestamp keys for message list, clear turn state on process exit

## 0.4.0

### Minor Changes

- 6c2266b: Add display labels to workspaces and redirect landing page to main workspace

### Patch Changes

- 75cfe49: Update CLAUDE.md changeset instructions to create files directly instead of using interactive CLI
- 9053c94: Extract WorkspaceHeader, MessageUser, MessageAssistant, StreamingMessage, and Composer components from the workspace chat page
- 4dcb094: Replace MetaPill component with plain message rendering and UIL icons for each message type
- 11317d0: Refresh InfoPane data when the browser tab regains focus

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
