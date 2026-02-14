import { ClaudeCodeAdapter } from './claude-code';
import type { AgentAdapter, AgentEvent, AgentProcess } from './types';

export type ConversationEvent =
	| { type: 'user_message'; messageId: string; content: string }
	| AgentEvent;

type Listener = (event: ConversationEvent) => void;

export interface ToolInvocation {
	tool: string;
	toolUseId: string;
	input: string;
}

interface ActiveConversation {
	process: AgentProcess | null;
	listeners: Set<Listener>;
	agentType: string;
	cwd: string;
	/** Tool calls accumulated during the current turn */
	toolInvocations: ToolInvocation[];
	/** Callback for each completed turn — persists assistant message + session ID */
	onComplete: ((text: string, sessionId: string, toolInvocations: ToolInvocation[]) => void) | null;
}

const adapters: Record<string, AgentAdapter> = {
	'claude-code': new ClaudeCodeAdapter()
};

const active = new Map<string, ActiveConversation>();

function getOrCreate(conversationId: string): ActiveConversation {
	let conv = active.get(conversationId);
	if (!conv) {
		conv = { process: null, listeners: new Set(), agentType: '', cwd: '', toolInvocations: [], onComplete: null };
		active.set(conversationId, conv);
	}
	return conv;
}

export function subscribe(conversationId: string, listener: Listener): () => void {
	const conv = getOrCreate(conversationId);
	conv.listeners.add(listener);

	return () => {
		conv.listeners.delete(listener);
		if (conv.listeners.size === 0 && !conv.process) {
			active.delete(conversationId);
		}
	};
}

export function sendMessage(
	conversationId: string,
	opts: {
		messageId: string;
		content: string;
		agentType: string;
		cwd: string;
		onComplete: (text: string, sessionId: string, toolInvocations: ToolInvocation[]) => void;
	}
): void {
	const conv = getOrCreate(conversationId);

	// Emit user message to all subscribers immediately
	for (const fn of conv.listeners) {
		fn({ type: 'user_message', messageId: opts.messageId, content: opts.content });
	}

	// Reset tool invocations for this new turn
	conv.toolInvocations = [];

	// Update the onComplete callback (the messages endpoint passes a fresh one each time
	// that closes over the correct conversation row)
	conv.onComplete = opts.onComplete;

	// If we already have a running process, just send the message into it
	if (conv.process) {
		conv.process.send(opts.content);
		return;
	}

	// Spawn a new persistent process
	const adapter = adapters[opts.agentType];
	if (!adapter) {
		for (const fn of conv.listeners) {
			fn({ type: 'error', message: `Unknown agent type: ${opts.agentType}` });
		}
		return;
	}

	conv.agentType = opts.agentType;
	conv.cwd = opts.cwd;

	const process = adapter.start({ cwd: opts.cwd });
	conv.process = process;

	process.onEvent((event) => {
		for (const fn of conv.listeners) {
			fn(event);
		}

		if (event.type === 'tool_use_start') {
			conv.toolInvocations.push({
				tool: event.tool,
				toolUseId: event.toolUseId,
				input: event.input
			});
		}

		if (event.type === 'message_complete' && conv.onComplete) {
			conv.onComplete(event.text, event.sessionId, conv.toolInvocations);
			conv.toolInvocations = [];
		}

		if (event.type === 'done') {
			conv.process = null;
		}
	});

	// Send the first message
	process.send(opts.content);
}

export function isProcessing(conversationId: string): boolean {
	return active.get(conversationId)?.process != null;
}

/** Return a debug snapshot of all active conversations */
export function debugState(): Array<{ conversationId: string; hasProcess: boolean; listeners: number }> {
	return [...active.entries()].map(([id, conv]) => ({
		conversationId: id,
		hasProcess: conv.process != null,
		listeners: conv.listeners.size
	}));
}

export function killProcess(conversationId: string): void {
	const conv = active.get(conversationId);
	if (conv?.process) {
		conv.process.kill();
		conv.process = null;
	}
}
