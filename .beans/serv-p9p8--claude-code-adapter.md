---
# serv-p9p8
title: Claude Code adapter
status: todo
type: task
created_at: 2026-02-14T12:09:39Z
updated_at: 2026-02-14T12:09:39Z
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
- [ ] Research Claude Code CLI streaming JSON format and flags
- [ ] Implement ClaudeCodeAdapter conforming to AgentAdapter interface
- [ ] Handle process spawn with correct cwd and flags
- [ ] Parse streaming JSON output into normalized messages
- [ ] Handle stdin relay for user messages
- [ ] Process lifecycle: graceful shutdown, crash detection
