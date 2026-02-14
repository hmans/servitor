import { spawn } from 'child_process';
import type { AgentAdapter, AgentProcess, AgentStartConfig, AgentEvent } from './types';

export class ClaudeCodeAdapter implements AgentAdapter {
	start(config: AgentStartConfig): AgentProcess {
		const args = [
			'-p',
			config.message,
			'--output-format',
			'stream-json',
			'--verbose'
		];

		if (config.sessionId) {
			args.push('--resume', config.sessionId);
		}

		const proc = spawn('claude', args, {
			cwd: config.cwd,
			stdio: ['pipe', 'pipe', 'pipe']
		});

		const listeners: Array<(event: AgentEvent) => void> = [];
		let fullText = '';
		let sessionId = '';
		let buffer = '';

		const emit = (event: AgentEvent) => {
			for (const fn of listeners) fn(event);
		};

		proc.stdout.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			// Keep the last incomplete line in the buffer
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const parsed = JSON.parse(line);
					const event = parseStreamEvent(parsed);

					if (parsed.session_id) {
						sessionId = parsed.session_id;
					}

					if (event) {
						if (event.type === 'text_delta') {
							fullText += event.text;
						}
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
			// Process remaining buffer
			if (buffer.trim()) {
				try {
					const parsed = JSON.parse(buffer);
					if (parsed.session_id) sessionId = parsed.session_id;
					const event = parseStreamEvent(parsed);
					if (event) {
						if (event.type === 'text_delta') fullText += event.text;
						emit(event);
					}
				} catch {
					// ignore
				}
			}

			emit({ type: 'message_complete', text: fullText, sessionId });
			emit({ type: 'done', sessionId });
		});

		proc.on('error', (err) => {
			emit({ type: 'error', message: err.message });
			emit({ type: 'done', sessionId });
		});

		return {
			onEvent(callback: (event: AgentEvent) => void) {
				listeners.push(callback);
			},
			kill() {
				proc.kill('SIGTERM');
			}
		};
	}
}

function parseStreamEvent(data: Record<string, unknown>): AgentEvent | null {
	// Handle result type (final output)
	if (data.type === 'result') {
		return null; // We build the full text from deltas instead
	}

	// Handle assistant message type
	if (data.type === 'assistant') {
		// Complete message object — we can extract text from content blocks
		const message = data.message as Record<string, unknown> | undefined;
		const content = (message?.content ?? data.content) as Array<Record<string, unknown>> | undefined;
		if (content) {
			const textBlock = content.find((b) => b.type === 'text');
			if (textBlock && typeof textBlock.text === 'string') {
				// We don't emit this as text_delta since we build from stream deltas
				return null;
			}
		}
		return null;
	}

	// Handle content_block_start for tool use
	if (data.type === 'content_block_start') {
		const block = data.content_block as Record<string, unknown> | undefined;
		if (block?.type === 'tool_use') {
			return {
				type: 'tool_use_start',
				tool: block.name as string,
				toolUseId: block.id as string
			};
		}
		return null;
	}

	// Handle content_block_delta for text
	if (data.type === 'content_block_delta') {
		const delta = data.delta as Record<string, unknown> | undefined;
		if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
			return { type: 'text_delta', text: delta.text };
		}
		return null;
	}

	return null;
}
