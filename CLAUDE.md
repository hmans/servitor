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
- **Testing:** Vitest (unit), Playwright (E2E); run `mise test` or `pnpm vitest run --project server`

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

- Each workspace has a single conversation, stored as flat files inside the worktree's `.servitor/` directory
- Directory structure:
  ```
  .servitor/conversation/
    meta.json            # {title, agentType, agentSessionId?, pendingInteraction?, createdAt}
    messages.jsonl       # one JSON object per line: {role, content, toolInvocations?, askUserAnswers?, ts}
  ```
- `src/lib/server/conversations.ts`: `ensureConversation()`, `getConversationMeta()`, `loadMessages()`, `appendMessage()`, `updateConversationMeta()`
- Messages are append-only (JSONL). No locking needed — one agent per workspace, user messages written synchronously.

## Route Structure

- `/` — Workspace list (landing page)
- `/workspaces/new` — Create workspace
- `/workspaces/[name]` — Workspace chat interface (e.g. `/workspaces/fix-bug`)
- `/api/workspaces/[name]/messages` — Send message to workspace agent
- `/api/workspaces/[name]/stream` — SSE stream for agent events
- `/api/workspaces/[name]/kill` — Kill agent process

## Agent Architecture

- Agents are spawned as persistent child processes (currently Claude Code CLI via `claude -p --input-format stream-json --output-format stream-json --verbose --dangerously-skip-permissions`)
- The agent manager (`src/lib/server/agents/manager.ts`) maintains in-memory state per conversation: the running process, event listeners, and accumulated tool invocations
- Manager key format: workspace name (e.g. `"fix-bug"`)
- Events flow: Agent process -> Manager (broadcasts) -> SSE endpoint -> Client EventSource
- Key agent events: `text_delta`, `thinking`, `tool_use_start`, `ask_user`, `exit_plan`, `message_complete`, `done`
- `message_complete` fires at the end of each turn (process stays alive); `done` fires only when the process exits
- The `onComplete` callback persists the assistant message + tool invocations via `appendMessage()`
- Environment: `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` is set to prevent orphaned background Task sub-agents that would outlive the parent process

### Kill-and-resume pattern for interactive tools

`AskUserQuestion` and `ExitPlanMode` are "blocking tools" that require user interaction. The `--dangerously-skip-permissions` flag causes the CLI to auto-handle these internally (auto-declining questions), and stdin `tool_result` messages are ignored. The workaround:

1. Detect the tool_use block in the stream (`AskUserQuestion` or `ExitPlanMode`)
2. Persist any partial assistant text + tool invocations via `onComplete`
3. Persist the pending interaction to `meta.json` (so it survives page reloads)
4. Broadcast the event to the UI so it can render the interactive form
5. Kill the process immediately (before the CLI auto-declines)
6. User answers via the UI → answer sent as a regular user message
7. A new process is spawned with `--resume <sessionId>`, picking up where it left off

### Stream-json `result` event gotcha

The `result` event that signals end-of-turn may have an empty/falsy `result` text field. Always emit `message_complete` on any `result` event unconditionally — don't gate it on truthy text. Otherwise the spinner persists after turns complete and the assistant message is never persisted.

## SSE Streaming

- Each workspace has an SSE endpoint at `/api/workspaces/[name]/stream`
- Client subscribes via `EventSource` and accumulates streaming parts (text + tool_use) into reactive state
- On `message_complete`, streaming state is cleared and the page refreshes from JSONL files via `invalidateAll()`
- The `connected` event includes a `processing` flag so the UI can pick up in-progress state on reconnect

## UI Conventions

- TUI-inspired monospace design with dark zinc palette
- Status dot in workspace header: green when agent is busy, gray when idle
- User messages rendered as inline pink badges
- Assistant messages rendered via the `Markdown` component with `leading-[1.8]` line height
- Tool invocations shown as a collapsible `[tools] Read x4, Bash x2` summary above the assistant message text
- During streaming, only the latest tool call is shown with a `+N more` badge
- Streaming text is revealed word-by-word via a client-side typewriter effect (20ms per word)
- Resizable panes via `PaneResizer` component

## Testing

- **Run tests:** `mise test` or `pnpm vitest run --project server`
- **Test config:** `vite.config.ts` defines two Vitest projects: `server` (node environment, `src/**/*.spec.ts`) and `client` (browser/Playwright, `src/**/*.svelte.spec.ts`)
- **Pure unit tests** (no mocking): `diff-parser.spec.ts`, `parse-events.spec.ts`
- **Mocked unit tests** (`vi.mock`): `conversations.spec.ts` (mocks `fs`), `git.spec.ts` and `workspaces.spec.ts` (mock `child_process` and `./config`)
- Modules that import `config` run `execSync` at load time — always `vi.mock('./config')` before importing them in tests
- `parseClaudeEvent()` and `summarizeToolInput()` live in `src/lib/server/agents/parse-events.ts` (extracted for testability, imported by `claude-code.ts`)

## Bit (ServitorBit)

Bit is Servitor's animated mascot — a low-poly pink icosahedron inspired by the "Bit" character from Tron. It lives in the composer area as the input prompt and reacts to agent activity.

### Architecture

- **`ServitorBit.svelte`** — Outer wrapper: Threlte `Canvas`, click handler (spawns ♥️ hearts + focuses composer), activity emoji spawner (✨⚡💫🔥💡⭐ on SSE pulses), `onclick` callback prop
- **`ServitorBitScene.svelte`** — Inner scene: `MeshStandardMaterial` with `flatShading`, ambient + directional lights, per-frame animation via `useTask`
- **`activity.svelte.ts`** — Svelte 5 reactive store bridging SSE events to Bit: `pulseCount` (incremented on SSE events + typewriter word reveals), `busy` flag (true while agent is working)
- Geometry: `IcosahedronGeometry(1, 0).toNonIndexed()` with `computeVertexNormals()` for solid flat-shaded faces

### Animation tiers

- **Idle**: very slow rotation (0.15 rad/s), gentle noise-based floating (3 layered sine frequencies per axis)
- **Busy** (`activity.busy`): faster rotation (3.0 + idle), slight emissive glow — set immediately on send, cleared on `message_complete`/`done`
- **Excited** (`activity.pulse()`): fast tumbling rotation (8.0 + busy + idle), scale pulse, strong emissive glow, noise-driven rotation across all 3 axes

### Interaction

- Click: triggers excitement spike + spawns 1-2 ♥️ hearts that float up and fade + focuses composer
- Activity emojis spawn every 5th SSE pulse
- The typewriter effect also pulses Bit on each revealed word
