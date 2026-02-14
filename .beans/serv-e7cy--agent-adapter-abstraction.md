---
# serv-e7cy
title: Agent adapter abstraction
status: in-progress
type: task
priority: normal
created_at: 2026-02-14T12:09:34Z
updated_at: 2026-02-14T12:34:54Z
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
- [ ] Define TypeScript interfaces for agent adapters
- [ ] Define normalized message types
- [ ] Set up adapter registry (map of agentType -> adapter)
