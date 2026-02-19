import { spawn, execSync } from 'child_process';
import type { AgentAdapter, AgentProcess, AgentStartConfig, AgentEvent } from './types';

// Resolve the full path to claude at module load time
let claudePath = 'claude';
try {
	claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
} catch {
	console.warn('[claude-code] could not resolve claude path, using "claude"');
}

export class ClaudeCodeAdapter implements AgentAdapter {
	start(config: AgentStartConfig): AgentProcess {
		const args = [
			'-p',
			'--input-format',
			'stream-json',
			'--output-format',
			'stream-json',
			'--verbose'
		];

		// Map execution mode to CLI permission flags
		if (config.executionMode === 'plan') {
			args.push('--permission-mode', 'plan');
		} else {
			args.push('--dangerously-skip-permissions');
		}

		if (config.sessionId) {
			args.push('--resume', config.sessionId);
		}

		// Strip CLAUDECODE env var to allow nested sessions
		const env = { ...process.env };
		delete env.CLAUDECODE;
		env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';

		const proc = spawn(claudePath, args, {
			cwd: config.cwd,
			stdio: ['pipe', 'pipe', 'pipe'],
			env
		});

		const listeners: Array<(event: AgentEvent) => void> = [];
		let sessionId = '';
		let buffer = '';

		const emit = (event: AgentEvent) => {
			for (const fn of listeners) fn(event);
		};

		proc.stdout.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const parsed = JSON.parse(line);

					if (parsed.session_id) {
						sessionId = parsed.session_id;
					}

					const events = parseClaudeEvent(parsed, sessionId);
					for (const event of events) {
						emit(event);
					}
				} catch {
					// Skip unparseable lines
				}
			}
		});

		proc.stderr.on('data', (chunk: Buffer) => {
			const text = chunk.toString().trim();
			if (text) {
				emit({ type: 'error', message: text });
			}
		});

		proc.on('close', () => {
			if (buffer.trim()) {
				try {
					const parsed = JSON.parse(buffer);
					if (parsed.session_id) sessionId = parsed.session_id;
					const events = parseClaudeEvent(parsed, sessionId);
					for (const event of events) {
						emit(event);
					}
				} catch {
					// ignore
				}
			}

			emit({ type: 'done', sessionId });
		});

		proc.on('error', (err) => {
			emit({ type: 'error', message: err.message });
			emit({ type: 'done', sessionId });
		});

		return {
			send(message: string) {
				const payload = JSON.stringify({
					type: 'user',
					message: { role: 'user', content: message }
				});
				proc.stdin.write(payload + '\n');
			},
			sendToolResult(toolUseId: string, result: string) {
				const payload = JSON.stringify({
					type: 'tool_result',
					tool_use_id: toolUseId,
					result
				});
				proc.stdin.write(payload + '\n');
			},
			onEvent(callback: (event: AgentEvent) => void) {
				listeners.push(callback);
			},
			kill() {
				proc.stdin.end();
				proc.kill('SIGTERM');
			}
		};
	}
}

/**
 * Parse Claude Code CLI stream-json events into our normalized events.
 *
 * Claude Code CLI emits these top-level types:
 * - "system" (subtypes: hook_started, hook_response, init) — skip
 * - "assistant" — contains message.content with text/tool_use blocks
 * - "result" — final result with full text
 */
function parseClaudeEvent(data: Record<string, unknown>, sessionId: string): AgentEvent[] {
	const events: AgentEvent[] = [];

	if (data.type === 'assistant') {
		const message = data.message as Record<string, unknown> | undefined;
		const content = (message?.content ?? []) as Array<Record<string, unknown>>;

		for (const block of content) {
			if (block.type === 'thinking' && typeof block.thinking === 'string') {
				events.push({ type: 'thinking', text: block.thinking });
			}
			if (block.type === 'text' && typeof block.text === 'string') {
				events.push({ type: 'text_delta', text: block.text });
			}
			if (block.type === 'tool_use') {
				const input = block.input as Record<string, unknown> | undefined;

				if (block.name === 'EnterPlanMode') {
					events.push({
						type: 'enter_plan',
						toolUseId: block.id as string,
						sessionId
					});
				} else if (block.name === 'AskUserQuestion') {
					const questions = (input?.questions ?? []) as Array<{
						question: string;
						header: string;
						options: Array<{ label: string; description: string; markdown?: string }>;
						multiSelect: boolean;
					}>;
					events.push({
						type: 'ask_user',
						toolUseId: block.id as string,
						questions,
						sessionId
					});
				} else if (block.name === 'ExitPlanMode') {
					events.push({
						type: 'exit_plan',
						toolUseId: block.id as string,
						allowedPrompts: input?.allowedPrompts as
							| Array<{ tool: string; prompt: string }>
							| undefined,
						sessionId
					});
				} else {
					events.push({
						type: 'tool_use_start',
						tool: block.name as string,
						toolUseId: block.id as string,
						input: summarizeToolInput(block.name as string, input)
					});
				}
			}
		}
	}

	if (data.type === 'result') {
		events.push({
			type: 'message_complete',
			text: (data.result as string) ?? '',
			sessionId: (data.session_id as string) ?? sessionId
		});
	}

	return events;
}

/** Extract a short human-readable summary of what a tool is doing */
function summarizeToolInput(tool: string, input?: Record<string, unknown>): string {
	if (!input) return '';

	switch (tool) {
		case 'Read':
			return (input.file_path as string) ?? '';
		case 'Write':
			return (input.file_path as string) ?? '';
		case 'Edit':
			return (input.file_path as string) ?? '';
		case 'Bash':
			return (input.command as string) ?? '';
		case 'Glob':
			return (input.pattern as string) ?? '';
		case 'Grep':
			return (input.pattern as string) ?? '';
		case 'WebFetch':
			return (input.url as string) ?? '';
		case 'WebSearch':
			return (input.query as string) ?? '';
		case 'Task':
			return (input.description as string) ?? '';
		default:
			return '';
	}
}
