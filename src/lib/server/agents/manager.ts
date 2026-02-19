import { ClaudeCodeAdapter } from './claude-code';
import type { AgentAdapter, AgentEvent, AgentProcess } from './types';
import { setPendingInteraction } from '$lib/server/conversations';

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
	/** Text accumulated during the current turn */
	turnText: string;
	/** Callback for each completed turn — persists assistant message + session ID */
	onComplete: ((text: string, sessionId: string, toolInvocations: ToolInvocation[]) => void) | null;
	/** Last known session ID for resumption */
	lastSessionId: string;
}

const adapters: Record<string, AgentAdapter> = {
	'claude-code': new ClaudeCodeAdapter()
};

const active = new Map<string, ActiveConversation>();

function getOrCreate(conversationId: string): ActiveConversation {
	let conv = active.get(conversationId);
	if (!conv) {
		conv = {
			process: null,
			listeners: new Set(),
			agentType: '',
			cwd: '',
			toolInvocations: [],
			turnText: '',
			onComplete: null,
			lastSessionId: ''
		};
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
		sessionId?: string;
		onComplete: (text: string, sessionId: string, toolInvocations: ToolInvocation[]) => void;
	}
): void {
	const conv = getOrCreate(conversationId);

	// Emit user message to all subscribers immediately
	for (const fn of conv.listeners) {
		fn({ type: 'user_message', messageId: opts.messageId, content: opts.content });
	}

	// Reset turn state for this new turn
	conv.toolInvocations = [];
	conv.turnText = '';

	// Update the onComplete callback (the messages endpoint passes a fresh one each time
	// that closes over the correct conversation row)
	conv.onComplete = opts.onComplete;

	// Seed lastSessionId from conversation meta if we don't have one in memory
	if (!conv.lastSessionId && opts.sessionId) {
		conv.lastSessionId = opts.sessionId;
	}

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

	const process = adapter.start({
		cwd: opts.cwd,
		sessionId: conv.lastSessionId || undefined
	});
	conv.process = process;

	process.onEvent((event) => {
		// Accumulate text for the current turn
		if (event.type === 'text_delta') {
			conv.turnText += event.text;
		}

		// Kill the process immediately when AskUserQuestion or ExitPlanMode is
		// detected. The user will answer via the UI and a new process will be
		// spawned with --resume.
		if (event.type === 'ask_user' || event.type === 'exit_plan') {
			conv.lastSessionId = event.sessionId;

			// Persist partial assistant message if there's accumulated content
			if ((conv.turnText || conv.toolInvocations.length > 0) && conv.onComplete) {
				conv.onComplete(conv.turnText, event.sessionId, conv.toolInvocations);
				conv.toolInvocations = [];
				conv.turnText = '';
			}

			// Persist the pending interaction so it survives page reloads
			if (event.type === 'ask_user') {
				setPendingInteraction(conv.cwd, { type: 'ask_user', questions: event.questions });
			} else {
				setPendingInteraction(conv.cwd, {
					type: 'exit_plan',
					allowedPrompts: event.allowedPrompts
				});
			}

			// Broadcast the event first so the UI can show the interaction
			for (const fn of conv.listeners) {
				fn(event);
			}
			// Then kill the process
			conv.process?.kill();
			return;
		}

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

		if (event.type === 'message_complete') {
			conv.lastSessionId = event.sessionId || conv.lastSessionId;
			if (conv.onComplete) {
				conv.onComplete(event.text, event.sessionId, conv.toolInvocations);
				conv.toolInvocations = [];
				conv.turnText = '';
			}
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

export function sendToolResult(conversationId: string, toolUseId: string, result: string): void {
	const conv = active.get(conversationId);
	if (conv?.process) {
		conv.process.sendToolResult(toolUseId, result);
	}
}

export function killProcess(conversationId: string): void {
	const conv = active.get(conversationId);
	if (conv?.process) {
		conv.process.kill();
		conv.process = null;
	}
}
