import { describe, it, expect } from 'vitest';
import { parseClaudeEvent, summarizeToolInput } from './parse-events';

describe('parseClaudeEvent', () => {
	const SESSION = 'sess-123';

	it('returns empty array for system events', () => {
		expect(parseClaudeEvent({ type: 'system', subtype: 'init' }, SESSION)).toEqual([]);
	});

	it('returns empty array for unknown event types', () => {
		expect(parseClaudeEvent({ type: 'unknown' }, SESSION)).toEqual([]);
	});

	it('parses thinking blocks', () => {
		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: {
					content: [{ type: 'thinking', thinking: 'Let me consider...' }]
				}
			},
			SESSION
		);
		expect(events).toEqual([{ type: 'thinking', text: 'Let me consider...' }]);
	});

	it('ignores thinking blocks with non-string thinking', () => {
		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: { content: [{ type: 'thinking', thinking: 42 }] }
			},
			SESSION
		);
		expect(events).toEqual([]);
	});

	it('parses text blocks', () => {
		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'Hello world' }] }
			},
			SESSION
		);
		expect(events).toEqual([{ type: 'text_delta', text: 'Hello world' }]);
	});

	it('ignores text blocks with non-string text', () => {
		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: { content: [{ type: 'text', text: null }] }
			},
			SESSION
		);
		expect(events).toEqual([]);
	});

	it('parses generic tool_use as tool_use_start', () => {
		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: {
					content: [
						{
							type: 'tool_use',
							id: 'tool-1',
							name: 'Read',
							input: { file_path: '/src/app.ts' }
						}
					]
				}
			},
			SESSION
		);
		expect(events).toEqual([
			{
				type: 'tool_use_start',
				tool: 'Read',
				toolUseId: 'tool-1',
				input: '/src/app.ts'
			}
		]);
	});

	it('parses EnterPlanMode as enter_plan', () => {
		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: {
					content: [{ type: 'tool_use', id: 'tool-2', name: 'EnterPlanMode', input: {} }]
				}
			},
			SESSION
		);
		expect(events).toEqual([
			{ type: 'enter_plan', toolUseId: 'tool-2', sessionId: SESSION }
		]);
	});

	it('parses AskUserQuestion as ask_user with questions', () => {
		const questions = [
			{
				question: 'Which approach?',
				header: 'Approach',
				options: [
					{ label: 'A', description: 'Option A' },
					{ label: 'B', description: 'Option B' }
				],
				multiSelect: false
			}
		];

		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: {
					content: [
						{
							type: 'tool_use',
							id: 'tool-3',
							name: 'AskUserQuestion',
							input: { questions }
						}
					]
				}
			},
			SESSION
		);

		expect(events).toEqual([
			{ type: 'ask_user', toolUseId: 'tool-3', questions, sessionId: SESSION }
		]);
	});

	it('parses ExitPlanMode as exit_plan with allowedPrompts', () => {
		const allowedPrompts = [{ tool: 'Bash', prompt: 'run tests' }];

		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: {
					content: [
						{
							type: 'tool_use',
							id: 'tool-4',
							name: 'ExitPlanMode',
							input: { allowedPrompts }
						}
					]
				}
			},
			SESSION
		);

		expect(events).toEqual([
			{ type: 'exit_plan', toolUseId: 'tool-4', allowedPrompts, sessionId: SESSION }
		]);
	});

	it('parses multiple content blocks in one message', () => {
		const events = parseClaudeEvent(
			{
				type: 'assistant',
				message: {
					content: [
						{ type: 'thinking', thinking: 'hmm' },
						{ type: 'text', text: 'Hello' },
						{
							type: 'tool_use',
							id: 'tool-5',
							name: 'Bash',
							input: { command: 'ls' }
						}
					]
				}
			},
			SESSION
		);

		expect(events).toHaveLength(3);
		expect(events[0].type).toBe('thinking');
		expect(events[1].type).toBe('text_delta');
		expect(events[2].type).toBe('tool_use_start');
	});

	it('handles assistant event with missing message', () => {
		const events = parseClaudeEvent({ type: 'assistant' }, SESSION);
		expect(events).toEqual([]);
	});

	it('handles assistant event with empty content', () => {
		const events = parseClaudeEvent(
			{ type: 'assistant', message: { content: [] } },
			SESSION
		);
		expect(events).toEqual([]);
	});

	describe('result events', () => {
		it('parses result with text', () => {
			const events = parseClaudeEvent(
				{ type: 'result', result: 'Final answer', session_id: 'sess-456' },
				SESSION
			);
			expect(events).toEqual([
				{ type: 'message_complete', text: 'Final answer', sessionId: 'sess-456' }
			]);
		});

		it('emits message_complete even with falsy result text (the gotcha)', () => {
			const events = parseClaudeEvent(
				{ type: 'result', result: '', session_id: 'sess-456' },
				SESSION
			);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('message_complete');
			expect((events[0] as { text: string }).text).toBe('');
		});

		it('emits message_complete with null result', () => {
			const events = parseClaudeEvent(
				{ type: 'result', result: null, session_id: 'sess-456' },
				SESSION
			);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('message_complete');
			expect((events[0] as { text: string }).text).toBe('');
		});

		it('falls back to passed sessionId when session_id missing', () => {
			const events = parseClaudeEvent({ type: 'result', result: 'done' }, SESSION);
			expect(events).toEqual([
				{ type: 'message_complete', text: 'done', sessionId: SESSION }
			]);
		});
	});
});

describe('summarizeToolInput', () => {
	it('returns empty string for undefined input', () => {
		expect(summarizeToolInput('Read')).toBe('');
	});

	it('returns empty string for unknown tool', () => {
		expect(summarizeToolInput('UnknownTool', { foo: 'bar' })).toBe('');
	});

	it.each([
		['Read', { file_path: '/src/app.ts' }, '/src/app.ts'],
		['Write', { file_path: '/src/new.ts' }, '/src/new.ts'],
		['Edit', { file_path: '/src/edit.ts' }, '/src/edit.ts'],
		['Bash', { command: 'npm test' }, 'npm test'],
		['Glob', { pattern: '**/*.ts' }, '**/*.ts'],
		['Grep', { pattern: 'TODO' }, 'TODO'],
		['WebFetch', { url: 'https://example.com' }, 'https://example.com'],
		['WebSearch', { query: 'vitest docs' }, 'vitest docs'],
		['Task', { description: 'run tests' }, 'run tests']
	])('summarizes %s tool', (tool, input, expected) => {
		expect(summarizeToolInput(tool, input)).toBe(expected);
	});

	it('summarizes TaskUpdate with taskId and status', () => {
		expect(summarizeToolInput('TaskUpdate', { taskId: 'task-1', status: 'done' })).toBe(
			'task-1 → done'
		);
	});

	it('returns empty string when expected field is missing', () => {
		expect(summarizeToolInput('Read', {})).toBe('');
	});
});
