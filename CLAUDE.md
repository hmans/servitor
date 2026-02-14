# Servitor

## The Basics

- A parallel agent orchestrator for high-velocity software development.
- SvelteKit full-stack web application.
- User can create one or multiple code projects (basically just a path to a git repository on the same machine.)
- Designed to be run locally, but also on a remote VM (with repositories on that VM).
- Integrates with GitHub for pull requests, issues, and project management.

## Tech Stack

- **Framework:** SvelteKit (Svelte 5 with runes)
- **Styling:** Tailwind CSS v4, monospace TUI-inspired aesthetic (Spline Sans Mono font)
- **Database:** SQLite via better-sqlite3, managed with Drizzle ORM
- **Schema migrations:** `pnpm db:push` (drizzle-kit push)
- **Markdown:** `marked` library with custom renderer (links open in new tabs)
- **Package manager:** pnpm

## Workspaces

- User can create, interact with, close etc. workspaces
- Each workspace is a git worktree of the project it belongs to
- Workspaces can contain one or more conversations (agent sessions)

## Agent Architecture

- Agents are spawned as persistent child processes (currently Claude Code CLI via `claude -p --input-format stream-json --output-format stream-json`)
- The agent manager (`src/lib/server/agents/manager.ts`) maintains in-memory state per conversation: the running process, event listeners, and accumulated tool invocations
- Events flow: Agent process -> Manager (broadcasts) -> SSE endpoint -> Client EventSource
- Key agent events: `text_delta`, `tool_use_start`, `message_complete`, `done`
- `message_complete` fires at the end of each turn (process stays alive); `done` fires only when the process exits
- The `onComplete` callback persists the assistant message + tool invocations to the DB

## Database Schema

- **project** — name, repo_path
- **workspace** — belongs to project, has branch + worktree_path
- **conversation** — belongs to workspace, has agentType + agentSessionId
- **message** — belongs to conversation, has role (user/assistant/system/tool), content, and optional `tool_invocations` (JSON array of `{ tool, toolUseId, input }`)

## SSE Streaming

- Each conversation has an SSE endpoint at `/api/conversations/[id]/stream`
- Client subscribes via `EventSource` and accumulates streaming parts (text + tool_use) into reactive state
- On `message_complete`, streaming state is cleared and the page refreshes from the DB via `invalidateAll()`
- The `connected` event includes a `processing` flag so the UI can pick up in-progress state on reconnect

## UI Conventions

- TUI-inspired monospace design with dark zinc palette
- Status dot in workspace header: green when agent is busy, gray when idle
- User messages rendered as inline pink badges
- Assistant messages rendered via the `Markdown` component with `leading-[1.8]` line height
- Tool invocations shown as `[tool] ToolName input` lines above the assistant message text
- Resizable panes via `PaneResizer` component
