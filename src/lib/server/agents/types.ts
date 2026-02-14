export interface AgentStartConfig {
	message: string;
	cwd: string;
	sessionId?: string;
}

export type AgentEvent =
	| { type: 'text_delta'; text: string }
	| { type: 'tool_use_start'; tool: string; toolUseId: string; input: string }
	| { type: 'tool_result'; toolUseId: string }
	| { type: 'message_complete'; text: string; sessionId: string }
	| { type: 'error'; message: string }
	| { type: 'done'; sessionId: string };

export interface AgentProcess {
	onEvent(callback: (event: AgentEvent) => void): void;
	kill(): void;
}

export interface AgentAdapter {
	start(config: AgentStartConfig): AgentProcess;
}
