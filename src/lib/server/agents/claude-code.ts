import { spawn, execSync } from 'child_process';
import type { AgentAdapter, AgentProcess, AgentStartConfig, AgentEvent, MessageContent } from './types';
import { parseClaudeEvent } from './parse-events';
import { logger } from '../logger';

// Resolve the full path to claude at module load time
let claudePath = 'claude';
try {
	claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
} catch {
	logger.warn('Could not resolve claude path, using "claude"');
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
			send(message: MessageContent) {
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

