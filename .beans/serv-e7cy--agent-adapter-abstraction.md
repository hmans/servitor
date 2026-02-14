---
# serv-e7cy
title: Agent adapter abstraction
status: completed
type: task
priority: normal
created_at: 2026-02-14T12:09:34Z
updated_at: 2026-02-14T13:58:17Z
parent: serv-6zn7
---

Define the interface that all agent CLI adapters must implement.

## Interface (rough sketch)
```typescript
interface AgentAdapter {
  spawn(config: AgentConfig): AgentProcess
}

interface AgentProcess {
  send(message: string): void
  onMessage(callback: (msg: AgentMessage) => void): void
  kill(): void
}

interface AgentMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done'
  content: unknown // adapter-specific, normalized
}
```

## Tasks
- [x] Define TypeScript interfaces for agent adapters
- [x] Define normalized message types
- [x] Set up adapter registry (map of agentType -> adapter)
