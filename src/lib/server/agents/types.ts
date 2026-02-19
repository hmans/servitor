export type ExecutionMode = 'plan' | 'build';

export interface AgentStartConfig {
	cwd: string;
	sessionId?: string;
	executionMode: ExecutionMode;
}

export interface AskUserQuestion {
	question: string;
	header: string;
	options: Array<{ label: string; description: string; markdown?: string }>;
	multiSelect: boolean;
}

export type AgentEvent =
	| { type: 'text_delta'; text: string }
	| { type: 'thinking'; text: string }
	| { type: 'tool_use_start'; tool: string; toolUseId: string; input: string }
	| { type: 'tool_result'; toolUseId: string }
	| { type: 'ask_user'; toolUseId: string; questions: AskUserQuestion[]; sessionId: string }
	| {
			type: 'exit_plan';
			toolUseId: string;
			allowedPrompts?: Array<{ tool: string; prompt: string }>;
			planContent?: string;
			planFilePath?: string;
			sessionId: string;
	  }
	| { type: 'message_complete'; text: string; sessionId: string }
	| { type: 'error'; message: string }
	| { type: 'done'; sessionId: string };

export interface AgentProcess {
	/** Send a user message into the running process */
	send(message: string): void;
	/** Send a tool result back to the running process */
	sendToolResult(toolUseId: string, result: string): void;
	onEvent(callback: (event: AgentEvent) => void): void;
	kill(): void;
}

export interface AgentAdapter {
	start(config: AgentStartConfig): AgentProcess;
}
