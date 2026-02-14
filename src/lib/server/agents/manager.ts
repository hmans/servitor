import { ClaudeCodeAdapter } from './claude-code';
import type { AgentAdapter, AgentEvent, AgentProcess } from './types';

export type ConversationEvent =
	| { type: 'user_message'; messageId: string; content: string }
	| AgentEvent;

type Listener = (event: ConversationEvent) => void;

interface QueuedMessage {
	messageId: string;
	content: string;
	agentType: string;
	cwd: string;
	onComplete: (text: string, sessionId: string) => void;
}

interface ActiveConversation {
	process: AgentProcess | null;
	listeners: Set<Listener>;
	queue: QueuedMessage[];
	/** Tracks the latest session ID so queued messages can resume */
	lastSessionId?: string;
}

const adapters: Record<string, AgentAdapter> = {
	'claude-code': new ClaudeCodeAdapter()
};

const active = new Map<string, ActiveConversation>();

function getOrCreate(conversationId: string): ActiveConversation {
	let conv = active.get(conversationId);
	if (!conv) {
		conv = { process: null, listeners: new Set(), queue: [] };
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

	// Emit user message to all subscribers immediately
	for (const fn of conv.listeners) {
		fn({ type: 'user_message', messageId: opts.messageId, content: opts.content });
	}

	// Seed the session ID if this is the first message with one
	if (opts.sessionId && !conv.lastSessionId) {
		conv.lastSessionId = opts.sessionId;
	}

	// If a process is already running, queue this message
	if (conv.process) {
		conv.queue.push({
			messageId: opts.messageId,
			content: opts.content,
			agentType: opts.agentType,
			cwd: opts.cwd,
			onComplete: opts.onComplete
		});
		return;
	}

	startProcess(conv, {
		content: opts.content,
		agentType: opts.agentType,
		cwd: opts.cwd,
		sessionId: opts.sessionId ?? conv.lastSessionId,
		onComplete: opts.onComplete
	});
}

function startProcess(
	conv: ActiveConversation,
	opts: {
		content: string;
		agentType: string;
		cwd: string;
		sessionId?: string;
		onComplete: (text: string, sessionId: string) => void;
	}
): void {
	const adapter = adapters[opts.agentType];
	if (!adapter) {
		for (const fn of conv.listeners) {
			fn({ type: 'error', message: `Unknown agent type: ${opts.agentType}` });
		}
		drainQueue(conv);
		return;
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
			// Track session ID for subsequent queued messages
			if (event.sessionId) {
				conv.lastSessionId = event.sessionId;
			}
		}

		if (event.type === 'done') {
			conv.process = null;
			drainQueue(conv);
		}
	});
}

function drainQueue(conv: ActiveConversation): void {
	const next = conv.queue.shift();
	if (!next) return;

	// Emit user_message event for the queued message
	for (const fn of conv.listeners) {
		fn({ type: 'user_message', messageId: next.messageId, content: next.content });
	}

	startProcess(conv, {
		content: next.content,
		agentType: next.agentType,
		cwd: next.cwd,
		sessionId: conv.lastSessionId,
		onComplete: next.onComplete
	});
}

export function killProcess(conversationId: string): void {
	const conv = active.get(conversationId);
	if (conv?.process) {
		conv.process.kill();
		conv.process = null;
	}
}
