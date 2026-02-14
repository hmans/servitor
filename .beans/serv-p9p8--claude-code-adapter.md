---
# serv-p9p8
title: Claude Code adapter
status: completed
type: task
priority: normal
created_at: 2026-02-14T12:09:39Z
updated_at: 2026-02-14T13:58:17Z
parent: serv-6zn7
---

Implement the agent adapter for Claude Code CLI.

## Approach
- Spawn `claude` CLI with `--output-format stream-json` (or equivalent)
- Parse newline-delimited JSON from stdout
- Relay user messages via stdin
- Set working directory to workspace worktree path
- Handle process lifecycle (start, stop, crash/restart)

## Reference
- Claude Code CLI docs for JSON streaming output format
- Need to research exact flags and output schema

## Tasks
- [x] Research Claude Code CLI streaming JSON format and flags
- [x] Implement ClaudeCodeAdapter conforming to AgentAdapter interface
- [x] Handle process spawn with correct cwd and flags
- [x] Parse streaming JSON output into normalized messages
- [x] N/A: CLI uses per-turn invocation with --resume, not stdin
- [x] Process lifecycle: graceful shutdown, crash detection
