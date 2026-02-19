# Servitor

## The Basics

- A parallel agent orchestrator for high-velocity software development.
- SvelteKit full-stack web application.
- Works with a single git repository — the one Servitor is launched from.
- Designed to be run locally, but also on a remote VM (with the repository on that VM).
- Integrates with GitHub for pull requests, issues, and project management.
- Must be launched from within a git repository.

## Tech Stack

- **Framework:** SvelteKit (Svelte 5 with runes)
- **Styling:** Tailwind CSS v4, monospace TUI-inspired aesthetic (Spline Sans Mono font)
- **Storage:** No database — workspaces derived from git worktrees, conversations stored as JSONL files
- **Markdown:** `marked` library with custom renderer (links open in new tabs)
- **Package manager:** pnpm

## Configuration

- Config is loaded at startup from CWD (`git rev-parse --show-toplevel`) and optional `.servitor.yml` in repo root
- `.servitor.yml` format:
  ```yaml
  name: My Project          # optional, defaults to basename of repo
  worktreesDir: ~/worktrees  # optional, defaults to ~/servitor-worktrees
  ```
- Config singleton: `src/lib/server/config.ts` exports `config` with `repoPath`, `projectName`, `projectSlug`, `worktreesDir`

## Workspaces

- Derived from git worktrees — `git worktree list --porcelain` filtered by `servitor/*` branches
- `src/lib/server/workspaces.ts`: `listWorkspaces()`, `getWorkspace(name)`, `createWorkspace(name)`, `deleteWorkspace(name)`
- No database state — if the worktree exists, the workspace is active

## Conversations & Messages

- Stored as flat files inside each worktree's `.servitor/` directory
- Directory structure:
  ```
  .servitor/conversations/
    1/meta.json          # {id, title, agentType, agentSessionId?, createdAt}
    1/messages.jsonl     # one JSON object per line: {role, content, toolInvocations?, ts}
    2/meta.json
    2/messages.jsonl
  ```
- `src/lib/server/conversations.ts`: `listConversations()`, `createConversation()`, `loadMessages()`, `appendMessage()`
- Messages are append-only (JSONL). No locking needed — one agent per conversation, user messages written synchronously.

## Route Structure

- `/` — Workspace list (landing page)
- `/workspaces/new` — Create workspace
- `/workspaces/[name]` — Workspace chat interface (e.g. `/workspaces/fix-bug`)
- `/api/workspaces/[name]/conversations/[convId]/*` — Conversation API endpoints

## Agent Architecture

- Agents are spawned as persistent child processes (currently Claude Code CLI via `claude -p --input-format stream-json --output-format stream-json`)
- The agent manager (`src/lib/server/agents/manager.ts`) maintains in-memory state per conversation: the running process, event listeners, and accumulated tool invocations
- Manager key format: `"workspace-name:convId"` (e.g. `"fix-bug:1"`)
- Events flow: Agent process -> Manager (broadcasts) -> SSE endpoint -> Client EventSource
- Key agent events: `text_delta`, `tool_use_start`, `message_complete`, `done`
- `message_complete` fires at the end of each turn (process stays alive); `done` fires only when the process exits
- The `onComplete` callback persists the assistant message + tool invocations via `appendMessage()`

## SSE Streaming

- Each conversation has an SSE endpoint at `/api/workspaces/[name]/conversations/[convId]/stream`
- Client subscribes via `EventSource` and accumulates streaming parts (text + tool_use) into reactive state
- On `message_complete`, streaming state is cleared and the page refreshes from JSONL files via `invalidateAll()`
- The `connected` event includes a `processing` flag so the UI can pick up in-progress state on reconnect

## UI Conventions

- TUI-inspired monospace design with dark zinc palette
- Status dot in workspace header: green when agent is busy, gray when idle
- User messages rendered as inline pink badges
- Assistant messages rendered via the `Markdown` component with `leading-[1.8]` line height
- Tool invocations shown as `[tool] ToolName input` lines above the assistant message text
- Resizable panes via `PaneResizer` component
