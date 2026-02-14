import { ClaudeCodeAdapter } from './claude-code';
import type { AgentAdapter, AgentEvent, AgentProcess } from './types';

export type ConversationEvent =
	| { type: 'user_message'; messageId: string; content: string }
	| AgentEvent;

type Listener = (event: ConversationEvent) => void;

interface ActiveConversation {
	process: AgentProcess | null;
	listeners: Set<Listener>;
}

const adapters: Record<string, AgentAdapter> = {
	'claude-code': new ClaudeCodeAdapter()
};

const active = new Map<string, ActiveConversation>();

function getOrCreate(conversationId: string): ActiveConversation {
	let conv = active.get(conversationId);
	if (!conv) {
		conv = { process: null, listeners: new Set() };
		active.set(conversationId, conv);
	}
	return conv;
}

export function subscribe(conversationId: string, listener: Listener): () => void {
	const conv = getOrCreate(conversationId);
	conv.listeners.add(listener);

	return () => {
		conv.listeners.delete(listener);
		// Clean up if no listeners and no active process
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
		sessionId?: string;
		onComplete: (text: string, sessionId: string) => void;
	}
): void {
	const conv = getOrCreate(conversationId);

	// Emit user message to all subscribers
	for (const fn of conv.listeners) {
		fn({ type: 'user_message', messageId: opts.messageId, content: opts.content });
	}

	const adapter = adapters[opts.agentType];
	if (!adapter) {
		for (const fn of conv.listeners) {
			fn({ type: 'error', message: `Unknown agent type: ${opts.agentType}` });
		}
		return;
	}

	// Kill any existing process
	if (conv.process) {
		conv.process.kill();
	}

	const process = adapter.start({
		message: opts.content,
		cwd: opts.cwd,
		sessionId: opts.sessionId
	});

	conv.process = process;

	process.onEvent((event) => {
		for (const fn of conv.listeners) {
			fn(event);
		}

		if (event.type === 'message_complete') {
			opts.onComplete(event.text, event.sessionId);
		}

		if (event.type === 'done') {
			conv.process = null;
		}
	});
}

export function killProcess(conversationId: string): void {
	const conv = active.get(conversationId);
	if (conv?.process) {
		conv.process.kill();
		conv.process = null;
	}
}
