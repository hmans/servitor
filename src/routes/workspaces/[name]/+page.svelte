<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate, invalidateAll } from '$app/navigation';
	import { onDestroy, tick } from 'svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import InfoPane from '$lib/components/InfoPane.svelte';
	import PaneResizer from '$lib/components/PaneResizer.svelte';
	import BrailleSpinner from '$lib/components/BrailleSpinner.svelte';
	import ServitorBit from '$lib/components/ServitorBit.svelte';

	import type { AskUserQuestion, ExecutionMode } from '$lib/server/agents/types';
	import type { Attachment } from '$lib/server/conversations';
	import { activity } from '$lib/stores/activity.svelte';
	import { linkifyUrls } from '$lib/linkify';

	let { data } = $props();

	const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
	const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

	let infoPaneWidth = $state(400);
	let input = $state('');
	let sending = $state(false);
	let processAlive = $state(false);
	let errorMessage = $state('');
	let executionMode: ExecutionMode = $state('build');
	let pendingAttachments: Array<{ file: File; preview: string; filename: string; mediaType: string }> = $state([]);
	let fileInputEl: HTMLInputElement | undefined = $state();
	let dragOver = $state(false);
	let verbose = $state(typeof localStorage !== 'undefined' && localStorage.getItem('verbose') === 'true');

	// Sync execution mode from server data
	$effect(() => {
		executionMode = (data.executionMode as ExecutionMode) ?? 'build';
	});
	let stuckToBottom = $state(true);
	let isProgrammaticScroll = false;

	let messagesEl: HTMLDivElement | undefined = $state();
	let composerEl: HTMLTextAreaElement | undefined = $state();

	function scrollToBottom() {
		if (!messagesEl) return;
		isProgrammaticScroll = true;
		messagesEl.scrollTop = messagesEl.scrollHeight;
		requestAnimationFrame(() => { isProgrammaticScroll = false; });
	}
	let eventSource: EventSource | null = null;
	let expandedMeta: Record<string, boolean> = $state({});

	function toggleMeta(key: string) {
		expandedMeta[key] = !expandedMeta[key];
	}

	function toolIcon(tool: string): string {
		switch (tool) {
			case 'Read': return 'icon-[uil--eye]';
			case 'Write': return 'icon-[uil--file-plus]';
			case 'Edit': return 'icon-[uil--pen]';
			case 'Bash': return 'icon-[uil--wrench]';
			case 'Glob': return 'icon-[uil--search]';
			case 'Grep': return 'icon-[uil--search-alt]';
			case 'WebFetch':
			case 'WebSearch': return 'icon-[uil--globe]';
			case 'Task': return 'icon-[uil--wrench]';
			case 'TodoWrite':
			case 'TaskCreate': return 'icon-[uil--clipboard-notes]';
			case 'TaskUpdate':
			case 'TaskGet':
			case 'TaskList': return 'icon-[uil--clipboard]';
			default: return 'icon-[uil--wrench]';
		}
	}

	function humanizeToolUse(tool: string, toolInput: string): string {
		switch (tool) {
			case 'Read': return toolInput ? `Reading ${toolInput}` : 'Reading a file';
			case 'Write': return toolInput ? `Writing ${toolInput}` : 'Writing a file';
			case 'Edit': return toolInput ? `Editing ${toolInput}` : 'Editing a file';
			case 'Bash': return toolInput ? `Running \`${toolInput}\`` : 'Running a command';
			case 'Glob': return toolInput ? `Finding files matching ${toolInput}` : 'Finding files';
			case 'Grep': return toolInput ? `Searching for "${toolInput}"` : 'Searching code';
			case 'WebFetch': return toolInput ? `Fetching ${toolInput}` : 'Fetching a URL';
			case 'WebSearch': return toolInput ? `Searching the web for "${toolInput}"` : 'Searching the web';
			case 'Task': return toolInput ? `Spawning task: ${toolInput}` : 'Spawning a sub-task';
			case 'TodoWrite':
			case 'TaskCreate': return toolInput ? `Added todo: ${toolInput}` : 'Added a todo';
			case 'TaskUpdate': return toolInput ? `Updating task ${toolInput}` : 'Updating a task';
			case 'TaskGet': return toolInput ? `Checking task ${toolInput}` : 'Checking a task';
			case 'TaskList': return 'Listing tasks';
			default: return toolInput ? `${tool} ${toolInput}` : tool;
		}
	}

	// Typewriter: progressively reveal streamed text word by word
	function createTypewriter(pulseBit = true) {
		let revealed = $state('');
		let target = $state('');
		let timer: ReturnType<typeof setInterval> | null = null;

		function start() {
			if (timer) return;
			timer = setInterval(() => {
				if (revealed.length >= target.length) {
					if (timer) clearInterval(timer);
					timer = null;
					return;
				}
				let next = target.indexOf(' ', revealed.length);
				if (next === -1) next = target.length;
				else next++;
				revealed = target.slice(0, next);
				if (pulseBit) activity.pulse();
			}, 20);
		}

		function setTarget(text: string) {
			if (text !== target) {
				target = text;
				start();
			}
		}

		function flush() {
			if (timer) { clearInterval(timer); timer = null; }
			revealed = target;
		}

		function reset() {
			if (timer) { clearInterval(timer); timer = null; }
			target = '';
			revealed = '';
		}

		return {
			get revealed() { return revealed; },
			get target() { return target; },
			setTarget,
			flush,
			reset
		};
	}

	const textTypewriter = createTypewriter(true);
	const thinkingTypewriter = createTypewriter(false);

	// Streaming state — built up as SSE events arrive
	let streamingParts: Array<
		| { type: 'text'; text: string }
		| { type: 'thinking'; text: string }
		| { type: 'tool_use'; tool: string; input: string; toolUseId: string }
		| { type: 'enter_plan'; toolUseId: string; answered: boolean }
		| {
				type: 'ask_user';
				toolUseId: string;
				questions: AskUserQuestion[];
				answered: boolean;
				submittedAnswers?: Record<string, string>;
		  }
		| {
				type: 'exit_plan';
				toolUseId: string;
				allowedPrompts?: Array<{ tool: string; prompt: string }>;
				planContent?: string;
				planFilePath?: string;
				answered: boolean;
		  }
	> = $state([]);

	// Local copy of messages for optimistic updates
	let localMessages: Array<{
		role: string;
		content: string;
		thinking?: string;
		toolInvocations?: Array<{ tool: string; toolUseId: string; input: string }>;
		askUserAnswers?: { questions: AskUserQuestion[]; answers: Record<string, string> };
		attachments?: Attachment[];
		/** Optimistic preview URLs (object URLs) keyed by attachment index */
		_previewUrls?: string[];
		ts: string;
	}> = $state([]);

	// Sync from server data when it changes
	$effect(() => {
		localMessages = [...data.messages];
	});

	// Feed streaming text and thinking into their typewriters
	$effect(() => {
		const textParts = streamingParts.filter((p) => p.type === 'text');
		const latest = textParts.length > 0 ? textParts[textParts.length - 1] : null;
		textTypewriter.setTarget(latest?.text ?? '');

		const thinkingParts = streamingParts.filter((p) => p.type === 'thinking');
		const latestThinking = thinkingParts.length > 0 ? thinkingParts[thinkingParts.length - 1] : null;
		thinkingTypewriter.setTarget(latestThinking?.text ?? '');

		if (streamingParts.length === 0) {
			textTypewriter.reset();
			thinkingTypewriter.reset();
		}
	});

	// Auto-scroll: when stuck to bottom, scroll unconditionally on any DOM mutation.
	// User scroll intent is detected via a scroll event listener.
	$effect(() => {
		if (!messagesEl) return;
		const el = messagesEl;

		// Scroll to bottom on mount
		tick().then(() => {
			stuckToBottom = true;
			scrollToBottom();
		});

		// When stuck, scroll unconditionally on any DOM mutation
		const observer = new MutationObserver(() => {
			if (stuckToBottom) scrollToBottom();
		});
		observer.observe(el, { childList: true, subtree: true, characterData: true });

		// Detect user scroll intent via direction: scroll-up instantly unsticks,
		// scroll-down near the bottom re-sticks.
		let lastScrollTop = el.scrollTop;
		function handleScroll() {
			const currentTop = el.scrollTop;
			if (isProgrammaticScroll) {
				lastScrollTop = currentTop;
				return;
			}
			const scrolledUp = currentTop < lastScrollTop;
			lastScrollTop = currentTop;

			if (scrolledUp) {
				stuckToBottom = false;
			} else {
				const nearBottom = el.scrollHeight - currentTop - el.clientHeight < 80;
				stuckToBottom = nearBottom;
			}
		}
		el.addEventListener('scroll', handleScroll, { passive: true });

		return () => {
			observer.disconnect();
			el.removeEventListener('scroll', handleScroll);
		};
	});

	// Focus composer on every navigation
	afterNavigate(() => {
		tick().then(() => composerEl?.focus());
	});

	const wsName = $derived(data.workspace.name);

	// SSE lifecycle
	$effect(() => {
		// Touch wsName so the effect re-runs when navigating between workspaces
		const _ws = wsName;

		streamingParts = [];
		sending = false;
		processAlive = false;
		activity.setBusy(false);

		const es = new EventSource(`/api/workspaces/${_ws}/stream`);

		// Track whether message_complete already fired this turn, so the
		// done handler can skip a redundant invalidateAll().
		let turnCompleted = false;

		// Wrap addEventListener to log all SSE events for debugging
		const _addEL = es.addEventListener.bind(es);
		es.addEventListener = (type: string, listener: EventListener, ...rest: any[]) => {
			_addEL(type, (e: Event) => {
				const me = e as MessageEvent;
				try {
					console.debug(`[SSE] ${type}`, me.data ? JSON.parse(me.data) : '(no data)');
				} catch {
					console.debug(`[SSE] ${type}`, me.data ?? '(no data)');
				}
				(listener as EventListener)(e);
			}, ...rest);
		};

		es.addEventListener('connected', (e) => {
			const event = JSON.parse(e.data);
			processAlive = !!event.processing;

			// If agent is mid-turn, show busy state immediately
			if (event.processing) {
				activity.setBusy(true);
			}

			// Restore pending interaction from server data if not actively processing
			if (!event.processing && data.pendingInteraction) {
				if (data.pendingInteraction.type === 'enter_plan') {
					streamingParts = [
						{ type: 'enter_plan', toolUseId: 'persisted', answered: false }
					];
				} else if (data.pendingInteraction.type === 'ask_user') {
					streamingParts = [
						{
							type: 'ask_user',
							toolUseId: 'persisted',
							questions: data.pendingInteraction.questions,
							answered: false
						}
					];
				} else if (data.pendingInteraction.type === 'exit_plan') {
					streamingParts = [
						{
							type: 'exit_plan',
							toolUseId: 'persisted',
							allowedPrompts: data.pendingInteraction.allowedPrompts,
							planContent: data.pendingInteraction.planContent,
							planFilePath: data.pendingInteraction.planFilePath,
							answered: false
						}
					];
				}
			}
		});

		es.addEventListener('thinking', (e) => {
			const event = JSON.parse(e.data);
			processAlive = true;
			sending = false;
			activity.setBusy(true);
			activity.pulse();
			streamingParts = [...streamingParts, { type: 'thinking', text: event.text }];
		});

		es.addEventListener('text_delta', (e) => {
			const event = JSON.parse(e.data);
			processAlive = true;
			sending = false;
			activity.setBusy(true);
			activity.pulse();
			streamingParts = [...streamingParts, { type: 'text', text: event.text }];
		});

		es.addEventListener('tool_use_start', (e) => {
			const event = JSON.parse(e.data);
			processAlive = true;
			sending = false;
			activity.setBusy(true);
			activity.pulse();
			activity.emitToolEmoji(event.tool);
			streamingParts = [
				...streamingParts,
				{
					type: 'tool_use',
					tool: event.tool,
					input: event.input ?? '',
					toolUseId: event.toolUseId
				}
			];
		});

		es.addEventListener('enter_plan', (e) => {
			const event = JSON.parse(e.data);
			sending = false;
			streamingParts = [
				...streamingParts,
				{ type: 'enter_plan', toolUseId: event.toolUseId, answered: false }
			];
		});

		es.addEventListener('ask_user', (e) => {
			const event = JSON.parse(e.data);
			// Process will be killed by the server — don't set processAlive
			sending = false;
			streamingParts = [
				...streamingParts,
				{
					type: 'ask_user',
					toolUseId: event.toolUseId,
					questions: event.questions,
					answered: false
				}
			];
		});

		es.addEventListener('exit_plan', (e) => {
			const event = JSON.parse(e.data);
			// Process will be killed by the server — don't set processAlive
			sending = false;
			streamingParts = [
				...streamingParts,
				{
					type: 'exit_plan',
					toolUseId: event.toolUseId,
					allowedPrompts: event.allowedPrompts,
					planContent: event.planContent,
					planFilePath: event.planFilePath,
					answered: false
				}
			];
		});

		es.addEventListener('message_complete', async () => {
			turnCompleted = true;
			sending = false;
			processAlive = false;
			activity.setBusy(false);

			// Instantly finish typewriters so there's no gap
			textTypewriter.flush();
			thinkingTypewriter.flush();

			// Load persisted messages first, THEN clear streaming parts.
			// This prevents a flash where neither streaming nor persisted text is visible.
			await invalidateAll();
			streamingParts = [];

			stuckToBottom = true;
			await tick();
			scrollToBottom();
		});

		es.addEventListener('done', async () => {
			sending = false;
			processAlive = false;
			activity.setBusy(false);

			// Instantly finish typewriters
			textTypewriter.flush();
			thinkingTypewriter.flush();

			// Preserve streaming parts if there's a pending interaction
			const hasPendingInteraction = streamingParts.some(
				(p) =>
					(p.type === 'enter_plan' || p.type === 'ask_user' || p.type === 'exit_plan') &&
					!p.answered
			);

			// Skip redundant invalidateAll() if message_complete already handled it
			if (!turnCompleted) {
				await invalidateAll();
			}
			turnCompleted = false;

			if (!hasPendingInteraction) {
				streamingParts = [];
			}

			stuckToBottom = true;
			await tick();
			scrollToBottom();
		});

		es.addEventListener('error', (e) => {
			try {
				const event = JSON.parse((e as MessageEvent).data);
				if (event.message) errorMessage = event.message;
			} catch {
				// Native EventSource error
			}
			sending = false;
			processAlive = false;
			activity.setBusy(false);
			streamingParts = [];
		});

		eventSource = es;

		return () => {
			es.close();
			eventSource = null;
		};
	});

	function addAttachment(file: File) {
		if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
			errorMessage = `Unsupported image type: ${file.type}`;
			return;
		}
		if (file.size > MAX_IMAGE_SIZE) {
			errorMessage = `Image too large (max 10MB): ${file.name}`;
			return;
		}
		const preview = URL.createObjectURL(file);
		pendingAttachments = [...pendingAttachments, { file, preview, filename: file.name, mediaType: file.type }];
	}

	function removeAttachment(index: number) {
		URL.revokeObjectURL(pendingAttachments[index].preview);
		pendingAttachments = pendingAttachments.filter((_, i) => i !== index);
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		for (const file of input.files) {
			addAttachment(file);
		}
		input.value = '';
	}

	function handlePaste(e: ClipboardEvent) {
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				e.preventDefault();
				const file = item.getAsFile();
				if (file) addAttachment(file);
			}
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = e.dataTransfer?.files;
		if (!files) return;
		for (const file of files) {
			if (file.type.startsWith('image/')) {
				addAttachment(file);
			}
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(',')[1]);
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	async function sendMessage() {
		if (!input.trim() && pendingAttachments.length === 0) return;

		const content = input.trim();
		input = '';
		if (composerEl) composerEl.style.height = 'auto';
		sending = true;
		activity.setBusy(true);
		errorMessage = '';

		// Convert pending attachments to base64 for transport
		let attachmentsPayload: Array<{ filename: string; mediaType: string; data: string }> | undefined;
		const previewUrls: string[] = [];
		if (pendingAttachments.length > 0) {
			attachmentsPayload = await Promise.all(
				pendingAttachments.map(async (a) => ({
					filename: a.filename,
					mediaType: a.mediaType,
					data: await fileToBase64(a.file)
				}))
			);
			// Collect preview URLs for optimistic rendering (don't revoke yet)
			for (const a of pendingAttachments) {
				previewUrls.push(a.preview);
			}
			pendingAttachments = [];
		}

		stuckToBottom = true;
		localMessages = [
			...localMessages,
			{
				role: 'user',
				content,
				attachments: attachmentsPayload?.map((a) => ({
					id: '',
					filename: a.filename,
					mediaType: a.mediaType,
					path: ''
				})),
				_previewUrls: previewUrls.length > 0 ? previewUrls : undefined,
				ts: new Date().toISOString()
			}
		];

		try {
			const body: Record<string, unknown> = { content };
			if (attachmentsPayload) body.attachments = attachmentsPayload;

			const res = await fetch(`/api/workspaces/${wsName}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Failed to send message' }));
				errorMessage = err.message ?? 'Failed to send message';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Network error';
		}

		// Revoke optimistic preview URLs (server data will take over after invalidateAll)
		for (const url of previewUrls) {
			URL.revokeObjectURL(url);
		}
	}

	// Pending answers: toolUseId -> { questionText -> "label" or "label1, label2" }
	let pendingAnswers: Record<string, Record<string, string>> = $state({});

	// Custom freeform answer text per toolUseId
	let customAnswer: Record<string, string> = $state({});

	// Preview state for markdown option previews: toolUseId -> { questionText -> hoveredLabel }
	let previewOption: Record<string, Record<string, string>> = $state({});

	/** Check whether a label is among the selected answers (works for both single/multi-select) */
	function isOptionPending(toolUseId: string, questionText: string, label: string): boolean {
		const answer = pendingAnswers[toolUseId]?.[questionText] ?? '';
		return answer
			.split(', ')
			.filter(Boolean)
			.includes(label);
	}

	/** Check whether a label was selected in a persisted answer */
	function wasOptionSelected(
		answers: Record<string, string>,
		questionText: string,
		label: string
	): boolean {
		const answer = answers[questionText] ?? '';
		return answer
			.split(', ')
			.filter(Boolean)
			.includes(label);
	}

	function selectOption(
		toolUseId: string,
		question: AskUserQuestion,
		label: string,
		allQuestions: AskUserQuestion[]
	) {
		if (!pendingAnswers[toolUseId]) {
			pendingAnswers[toolUseId] = {};
		}

		if (question.multiSelect) {
			// Toggle: add/remove from comma-separated list
			const current = pendingAnswers[toolUseId][question.question] ?? '';
			const selected = current.split(', ').filter(Boolean);
			const idx = selected.indexOf(label);
			if (idx >= 0) {
				selected.splice(idx, 1);
			} else {
				selected.push(label);
			}
			pendingAnswers[toolUseId][question.question] = selected.join(', ');
		} else {
			// Single select
			pendingAnswers[toolUseId][question.question] = label;
		}

		// Auto-submit for single-select with a single question
		if (!question.multiSelect && allQuestions.length === 1) {
			submitAnswers(toolUseId, allQuestions);
		}
	}

	function focusPreview(toolUseId: string, questionText: string, label: string) {
		if (!previewOption[toolUseId]) previewOption[toolUseId] = {};
		previewOption[toolUseId][questionText] = label;
	}

	function formatAnswer(questions: AskUserQuestion[], answers: Record<string, string>): string {
		const parts: string[] = [];
		for (const q of questions) {
			const answer = answers[q.question];
			if (answer) {
				parts.push(`For "${q.question}", I selected: ${answer}`);
			}
		}
		return parts.join('\n\n');
	}

	/** Whether a set of questions needs a submit button (multi-question or any multiSelect) */
	function needsSubmitButton(questions: AskUserQuestion[]): boolean {
		return questions.length > 1 || questions.some((q) => q.multiSelect);
	}

	async function submitAnswers(toolUseId: string, questions: AskUserQuestion[]) {
		const answers = pendingAnswers[toolUseId] ?? {};
		const content = formatAnswer(questions, answers);
		if (!content) return;

		// Clear streaming parts — the persisted message will carry the rich UI
		streamingParts = [];
		delete pendingAnswers[toolUseId];
		delete previewOption[toolUseId];

		// Build the structured data for persistence
		const askUserAnswers = { questions, answers };

		// Add as a local message immediately
		sending = true;
		activity.setBusy(true);
		stuckToBottom = true;
		localMessages = [
			...localMessages,
			{ role: 'user', content, askUserAnswers, ts: new Date().toISOString() }
		];

		try {
			const res = await fetch(`/api/workspaces/${wsName}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content, askUserAnswers })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Failed to send answer' }));
				errorMessage = err.message ?? 'Failed to send answer';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to send answer';
		}
	}

	async function submitCustomAnswer(toolUseId: string) {
		const content = customAnswer[toolUseId]?.trim();
		if (!content) return;

		streamingParts = [];
		delete customAnswer[toolUseId];
		delete pendingAnswers[toolUseId];
		delete previewOption[toolUseId];

		sending = true;
		activity.setBusy(true);
		stuckToBottom = true;
		localMessages = [
			...localMessages,
			{ role: 'user', content, ts: new Date().toISOString() }
		];

		try {
			const res = await fetch(`/api/workspaces/${wsName}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Failed to send answer' }));
				errorMessage = err.message ?? 'Failed to send answer';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to send answer';
		}
	}

	async function setMode(mode: ExecutionMode) {
		try {
			const res = await fetch(`/api/workspaces/${wsName}/mode`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode })
			});
			if (res.ok) {
				executionMode = mode;
				// If process was running, it was killed — reflect that
				processAlive = false;
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to change mode';
		}
	}

	async function approveEnterPlan(approved: boolean) {
		streamingParts = [];
		sending = true;
		activity.setBusy(true);

		if (approved) {
			await setMode('plan');
		}

		const content = approved
			? 'Yes, please plan first.'
			: 'No, just proceed with implementation.';

		stuckToBottom = true;
		localMessages = [...localMessages, { role: 'user', content, ts: new Date().toISOString() }];

		try {
			const res = await fetch(`/api/workspaces/${wsName}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Failed to send' }));
				errorMessage = err.message ?? 'Failed to send';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to send';
		}
	}

	async function approvePlan(approved: boolean) {
		streamingParts = [];
		sending = true;
		activity.setBusy(true);

		// Switch from plan → build on approval
		if (approved && executionMode === 'plan') {
			await setMode('build');
		}

		const content = approved
			? 'Plan approved. Proceed with the implementation.'
			: 'Plan rejected. Please revise the plan.';

		stuckToBottom = true;
		localMessages = [...localMessages, { role: 'user', content, ts: new Date().toISOString() }];

		try {
			const res = await fetch(`/api/workspaces/${wsName}/messages`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Failed to send' }));
				errorMessage = err.message ?? 'Failed to send';
			}
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to send';
		}
	}



	async function stopProcess() {
		try {
			await fetch(`/api/workspaces/${wsName}/kill`, { method: 'POST' });
		} catch {
			// Process may already be dead
		}
		processAlive = false;
		sending = false;
		streamingParts = [];
		activity.setBusy(false);
		await invalidateAll();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
		if (e.key === 'Escape' && processAlive) {
			e.preventDefault();
			stopProcess();
		}
	}

	onDestroy(() => {
		eventSource?.close();
	});
</script>

<svelte:head><title>{data.workspace.name} - Servitor</title></svelte:head>

<!-- Shared snippet for rendering a question's options (used in both streaming and persisted views) -->
{#snippet questionOptions(q: AskUserQuestion, toolUseId: string, allQuestions: AskUserQuestion[], interactive: boolean)}
	{@const hasMarkdown = q.options.some((o) => o.markdown)}

	{#if hasMarkdown && interactive}
		<!-- Side-by-side: option list + markdown preview -->
		<div class="flex gap-4">
			<div class="flex w-1/3 flex-col gap-1.5">
				{#each q.options as option}
					{@const selected = isOptionPending(toolUseId, q.question, option.label)}
					<button
						onmouseenter={() => focusPreview(toolUseId, q.question, option.label)}
						onclick={() => selectOption(toolUseId, q, option.label, allQuestions)}
						class="rounded border px-3 py-1.5 text-left text-sm transition-colors {selected
							? 'border-pink-500 bg-pink-500/20 text-pink-400'
							: 'border-zinc-600 text-zinc-300 hover:border-pink-500 hover:text-pink-400'}"
					>
						<div>{option.label}</div>
						{#if option.description}
							<div class="text-xs text-zinc-500">{option.description}</div>
						{/if}
					</button>
				{/each}
			</div>
			<div
				class="flex-1 overflow-auto rounded border border-zinc-700 bg-zinc-900/50 p-3"
			>
				{#if q.options.find((o) => o.label === previewOption[toolUseId]?.[q.question])?.markdown}
					<pre class="whitespace-pre-wrap font-mono text-xs text-zinc-400">{q.options.find((o) => o.label === previewOption[toolUseId]?.[q.question])?.markdown}</pre>
				{:else}
					<span class="text-xs text-zinc-600">Hover an option to preview</span>
				{/if}
			</div>
		</div>
	{:else if interactive}
		<!-- Horizontal buttons (no markdown) -->
		<div class="flex flex-wrap gap-2">
			{#each q.options as option}
				{@const selected = isOptionPending(toolUseId, q.question, option.label)}
				<button
					onclick={() => selectOption(toolUseId, q, option.label, allQuestions)}
					class="rounded border px-3 py-1.5 text-sm transition-colors {selected
						? 'border-pink-500 bg-pink-500/20 text-pink-400'
						: 'border-zinc-600 text-zinc-300 hover:border-pink-500 hover:text-pink-400'}"
					title={option.description}
				>
					{option.label}
				</button>
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet questionOptionsReadonly(q: AskUserQuestion, answers: Record<string, string>)}
	<div class="flex flex-wrap gap-2">
		{#each q.options as option}
			{@const selected = wasOptionSelected(answers, q.question, option.label)}
			<span
				class="rounded border px-3 py-1.5 text-sm {selected
					? 'border-pink-500 bg-pink-500/20 text-pink-400'
					: 'border-zinc-800 text-zinc-700'}"
			>
				{option.label}
			</span>
		{/each}
	</div>
{/snippet}

<div class="flex h-full">
	<!-- Chat column -->
	<div
		class="flex min-w-0 flex-1 flex-col border-l-2 pl-3 pr-3 font-mono {executionMode === 'plan'
			? 'border-l-amber-500/50'
			: 'border-l-transparent'}"
	>
		<!-- Header -->
		<div
			class="flex items-center justify-between pb-3 {executionMode === 'plan'
				? 'border-b border-amber-500/30'
				: 'border-b border-zinc-800'}"
		>
			<div class="flex items-center gap-2 text-sm">
				<span class="text-zinc-200">{data.workspace.name}</span>
				{#if processAlive || sending}
					<span class="inline-block h-2 w-2 rounded-full bg-green-500"></span>
				{:else}
					<span class="inline-block h-2 w-2 rounded-full bg-zinc-700"></span>
				{/if}
			</div>
			<div class="flex items-center gap-3">
				<!-- Execution mode selector -->
				<div class="flex gap-1 text-xs">
					{#each ['plan', 'build'] as mode}
						<button
							onclick={() => setMode(mode as ExecutionMode)}
							class="rounded px-2 py-0.5 transition-colors {executionMode === mode
								? mode === 'plan'
									? 'bg-amber-500/20 text-amber-400'
									: 'bg-green-500/20 text-green-400'
								: 'text-zinc-600 hover:text-zinc-400'}"
						>
							{mode}
						</button>
					{/each}
				</div>
				<button
					onclick={() => { verbose = !verbose; localStorage.setItem('verbose', String(verbose)); }}
					class="text-xs transition-colors {verbose
						? 'text-zinc-300'
						: 'text-zinc-600 hover:text-zinc-400'}"
				>
					[verbose]
				</button>
				<form method="POST" action="?/delete" use:enhance>
					<button
						type="submit"
						onclick={(e: MouseEvent) => {
							if (!confirm('Delete this workspace and its worktree?')) e.preventDefault();
						}}
						class="text-xs text-zinc-600 transition-colors hover:text-red-400"
					>
						[delete]
					</button>
				</form>
			</div>
		</div>

		<!-- Messages -->
		<div class="relative flex-1">
		<div bind:this={messagesEl} class="absolute inset-0 overflow-auto py-3">
			<div class="flex min-h-full flex-col justify-end">
			{#if localMessages.length === 0 && !sending}
				<div class="flex h-full items-center justify-center">
					<p class="text-sm text-zinc-600">Type a message to begin.</p>
				</div>
			{:else}
				<div class="space-y-6 leading-[1.8]">
					{#each localMessages as msg, i (i)}
						<div class="group">
							{#if msg.role === 'user' && msg.askUserAnswers}
								<!-- Persisted answer with rich UI -->
								<div class="rounded border border-zinc-700 p-4">
									{#each msg.askUserAnswers.questions as q}
										<div class="mb-4 last:mb-0">
											<div class="mb-1 text-xs uppercase tracking-wide text-amber-600">
												{q.header}
											</div>
											<div class="mb-3 text-sm text-zinc-200">{q.question}</div>
											{@render questionOptionsReadonly(q, msg.askUserAnswers?.answers ?? {})}
										</div>
									{/each}
								</div>
							{:else if msg.role === 'user'}
								<div>
									{#if msg.content}
										<div
											class="inline-block whitespace-pre-wrap rounded bg-pink-500/50 px-2 py-0.5 text-sm text-white"
										>
											{@html linkifyUrls(msg.content)}
										</div>
									{/if}
									{#if msg.attachments?.length}
										<div class="mt-1 flex gap-2">
											{#each msg.attachments as att, attIdx}
												{@const src = msg._previewUrls?.[attIdx] || (att.id ? `/api/workspaces/${wsName}/attachments/${att.id}` : '')}
												{#if src}
													<a
														href={src}
														target="_blank"
														class="block h-20 w-20 overflow-hidden rounded border border-zinc-700 transition-colors hover:border-pink-500"
													>
														<img
															{src}
															alt={att.filename}
															class="h-full w-full object-cover"
														/>
													</a>
												{/if}
											{/each}
										</div>
									{/if}
								</div>
							{:else}
								{#if msg.thinking && verbose}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="my-1 cursor-pointer rounded bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-500"
									onclick={() => toggleMeta(`${i}-thinking`)}
								>
									{#if expandedMeta[`${i}-thinking`]}
										<span class="icon-[uil--brain] mr-1 inline-block align-text-bottom"></span>Thinking
										<Markdown content={msg.thinking} />
									{:else}
										<span class="icon-[uil--brain] mr-1 inline-block align-text-bottom"></span>Thinking...
									{/if}
								</div>
							{/if}
								{#if msg.toolInvocations?.length}
								{#if verbose}
									{#each msg.toolInvocations as tool, ti}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div
											class="my-1 cursor-pointer rounded bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-500"
											class:truncate={!expandedMeta[`${i}-tool-${ti}`]}
											onclick={() => toggleMeta(`${i}-tool-${ti}`)}
										><span class="{toolIcon(tool.tool)} mr-1 inline-block align-text-bottom"></span>{humanizeToolUse(tool.tool, tool.input)}</div>
									{/each}
								{:else}
									<div class="mb-1 text-xs text-zinc-600">
										<span class="text-zinc-700">[tools]</span>
										{Object.entries(msg.toolInvocations.reduce((acc: Record<string, number>, t) => { acc[t.tool] = (acc[t.tool] || 0) + 1; return acc; }, {})).map(([tool, n]) => n > 1 ? tool + ' x' + n : tool).join(', ')}
									</div>
								{/if}
								{/if}
								<div class="text-sm text-zinc-300">
									<Markdown content={msg.content} />
								</div>
							{/if}
						</div>
					{/each}

					<!-- Streaming content -->
					{#if streamingParts.length > 0}
						<div class="space-y-3">
							{#if thinkingTypewriter.revealed && verbose}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="my-1 cursor-pointer rounded bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-500"
									onclick={() => toggleMeta('streaming-thinking')}
								>
									{#if expandedMeta['streaming-thinking']}
										<span class="icon-[uil--brain] mr-1 inline-block align-text-bottom"></span>Thinking
										<Markdown content={thinkingTypewriter.revealed} />
									{:else}
										<span class="icon-[uil--brain] mr-1 inline-block align-text-bottom"></span>Thinking...
									{/if}
								</div>
							{/if}
							{#each streamingParts as part, i (i)}
								{#if part.type === 'tool_use' && verbose}
									<!-- svelte-ignore a11y_click_events_have_key_events -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										class="my-1 cursor-pointer rounded bg-zinc-800/60 px-2 py-0.5 text-xs text-zinc-500"
										class:truncate={!expandedMeta[`streaming-tool-${i}`]}
										onclick={() => toggleMeta(`streaming-tool-${i}`)}
									><span class="{toolIcon(part.tool)} mr-1 inline-block align-text-bottom"></span>{humanizeToolUse(part.tool, part.input)}</div>
								{:else if part.type === 'enter_plan'}
									<div class="my-3 rounded border border-amber-700/50 bg-amber-500/5 p-4">
										<div class="mb-2 text-xs uppercase tracking-wide text-amber-600">
											Enter Plan Mode
										</div>
										<div class="mb-3 text-sm text-zinc-300">
											The agent wants to plan before implementing. Switch to plan mode?
										</div>
										{#if !part.answered}
											<div class="flex gap-2">
												<button
													onclick={() => approveEnterPlan(true)}
													class="rounded border border-amber-600 px-4 py-1.5 text-sm text-amber-400 transition-colors hover:bg-amber-500/20"
												>
													[plan first]
												</button>
												<button
													onclick={() => approveEnterPlan(false)}
													class="rounded border border-zinc-600 px-4 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-500/20"
												>
													[just build]
												</button>
											</div>
										{/if}
									</div>
								{:else if part.type === 'ask_user'}
									<div class="my-3 rounded border border-zinc-700 p-4">
										{#each part.questions as q}
											<div class="mb-4 last:mb-0">
												<div class="mb-1 text-xs uppercase tracking-wide text-amber-600">
													{q.header}
												</div>
												<div class="mb-3 text-sm text-zinc-200">{q.question}</div>
												{#if part.answered}
													{@render questionOptionsReadonly(q, part.submittedAnswers ?? {})}
												{:else}
													{@render questionOptions(q, part.toolUseId, part.questions, true)}
												{/if}
											</div>
										{/each}
										{#if !part.answered && needsSubmitButton(part.questions)}
											{@const answeredCount = Object.keys(
												pendingAnswers[part.toolUseId] ?? {}
											).filter((k) => pendingAnswers[part.toolUseId][k]).length}
											<div
												class="mt-4 flex items-center gap-3 border-t border-zinc-700/50 pt-3"
											>
												<button
													onclick={() =>
														submitAnswers(part.toolUseId, part.questions)}
													disabled={answeredCount === 0}
													class="rounded border border-pink-600 px-4 py-1.5 text-sm text-pink-400 transition-colors hover:bg-pink-500/20 disabled:cursor-not-allowed disabled:opacity-30"
												>
													[submit {answeredCount}/{part.questions.length}]
												</button>
												<span class="text-xs text-zinc-600">
													{answeredCount === part.questions.length
														? 'All answered'
														: `${part.questions.length - answeredCount} unanswered`}
												</span>
											</div>
										{/if}
										{#if !part.answered}
											<div class="mt-3 flex items-end gap-2 border-t border-zinc-700/50 pt-3">
												<span class="pb-1.5 text-xs text-zinc-600">or</span>
												<input
													type="text"
													bind:value={customAnswer[part.toolUseId]}
													onkeydown={(e) => {
														if (e.key === 'Enter') {
															e.preventDefault();
															submitCustomAnswer(part.toolUseId);
														}
													}}
													placeholder="Type a custom answer..."
													class="flex-1 bg-transparent py-1 text-sm text-pink-400 placeholder-zinc-700 focus:outline-none"
												/>
												<button
													onclick={() => submitCustomAnswer(part.toolUseId)}
													disabled={!customAnswer[part.toolUseId]?.trim()}
													class="pb-0.5 text-xs text-zinc-600 transition-colors hover:text-zinc-300 disabled:opacity-20"
												>
													[reply]
												</button>
											</div>
										{/if}
									</div>
								{:else if part.type === 'exit_plan'}
									<div class="my-3 rounded border border-zinc-700 p-4">
										<div class="mb-2 flex items-center gap-3 text-xs uppercase tracking-wide text-amber-600">
											<span>Plan Approval</span>
											{#if part.planFilePath}
												<span class="normal-case tracking-normal text-zinc-600">{part.planFilePath}</span>
											{/if}
										</div>
										{#if part.planContent}
											<details open={!part.answered}>
												<summary class="mb-2 cursor-pointer text-xs text-zinc-500 hover:text-zinc-400">
													{part.answered ? 'Show plan' : 'Plan details'}
												</summary>
												<div class="mb-4 max-h-[60vh] overflow-auto rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-300">
													<Markdown content={part.planContent} />
												</div>
											</details>
										{/if}
										{#if part.allowedPrompts?.length}
											<div class="mb-3 text-xs text-zinc-500">
												Requested permissions: {part.allowedPrompts
													.map((p) => `${p.tool}: ${p.prompt}`)
													.join(', ')}
											</div>
										{/if}
										{#if !part.answered}
											<div class="flex gap-2">
												<button
													onclick={() => approvePlan(true)}
													class="rounded border border-green-600 px-4 py-1.5 text-sm text-green-400 transition-colors hover:bg-green-500/20"
												>
													[approve]
												</button>
												<button
													onclick={() => approvePlan(false)}
													class="rounded border border-red-600 px-4 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/20"
												>
													[reject]
												</button>
											</div>
										{/if}
									</div>
								{/if}
							{/each}
							{#if textTypewriter.revealed}
								<div class="text-sm text-zinc-300">
									<Markdown content={textTypewriter.revealed} />
								</div>
							{/if}
							{#if !streamingParts.some((p) => (p.type === 'enter_plan' || p.type === 'ask_user' || p.type === 'exit_plan') && !p.answered)}
								<div class="pl-3">
									<BrailleSpinner />
								</div>
							{/if}
						</div>
					{:else if sending || activity.busy}
						<div class="pl-3">
							<BrailleSpinner />
						</div>
					{/if}
				</div>
			{/if}
			</div>
		</div>

		{#if !stuckToBottom}
			<button
				onclick={() => { stuckToBottom = true; scrollToBottom(); }}
				class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded border
					   border-zinc-700 bg-zinc-900/90 px-3 py-1 text-xs text-zinc-400
					   backdrop-blur-sm transition-colors hover:border-pink-500
					   hover:text-pink-400"
			>
				[scroll to bottom]
			</button>
		{/if}
		</div>

		<!-- Error -->
		{#if errorMessage}
			<div class="border-t border-red-900/50 px-3 py-2 text-xs text-red-400">
				<span class="text-red-600">[error]</span>
				{errorMessage}
				<button
					onclick={() => (errorMessage = '')}
					class="ml-2 text-red-600 hover:text-red-400">dismiss</button
				>
			</div>
		{/if}

		<!-- Input -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="pt-3 {executionMode === 'plan'
				? 'border-t border-amber-500/30'
				: 'border-t border-zinc-800'} {dragOver ? 'ring-1 ring-pink-500/50 rounded' : ''}"
			ondrop={handleDrop}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
		>
			{#if pendingAttachments.length > 0}
				<div class="mb-2 flex gap-2 pl-16">
					{#each pendingAttachments as att, i}
						<div class="group relative h-16 w-16 overflow-hidden rounded border border-zinc-700">
							<img src={att.preview} alt={att.filename} class="h-full w-full object-cover" />
							<button
								onclick={() => removeAttachment(i)}
								class="absolute -right-0.5 -top-0.5 hidden h-4 w-4 rounded-full bg-red-600 text-[10px] leading-none text-white group-hover:block"
							>x</button>
						</div>
					{/each}
				</div>
			{/if}
			<input
				type="file"
				accept={ACCEPTED_IMAGE_TYPES.join(',')}
				multiple
				class="hidden"
				bind:this={fileInputEl}
				onchange={handleFileSelect}
			/>
			<div class="flex items-center gap-2">
				<div class="h-14 w-14 shrink-0 overflow-visible">
					<ServitorBit pulse={activity.pulseCount} busy={activity.busy} toolEmojiId={activity.toolEmojiId} toolEmoji={activity.toolEmoji} onclick={() => composerEl?.focus()} />
				</div>
				<textarea
					bind:this={composerEl}
					bind:value={input}
					onkeydown={handleKeydown}
					onpaste={handlePaste}
					oninput={(e) => {
						const el = e.currentTarget;
						el.style.height = "auto";
						el.style.height = Math.min(el.scrollHeight, 200) + "px";
					}}
					placeholder=""
					rows="1"
					class="flex-1 resize-none bg-transparent py-1.5 text-sm text-pink-400 placeholder-zinc-700 focus:outline-none"
				></textarea>
				<button
					onclick={() => fileInputEl?.click()}
					class="text-xs text-zinc-600 transition-colors hover:text-zinc-300"
					title="Attach image"
				>
					[img]
				</button>
				{#if processAlive}
					<button
						onclick={stopProcess}
						class="text-xs text-red-600 transition-colors hover:text-red-400"
					>
						[stop]
					</button>
				{:else}
					<button
						onclick={sendMessage}
						disabled={!input.trim() && pendingAttachments.length === 0}
						class="text-xs text-zinc-600 transition-colors hover:text-zinc-300 disabled:opacity-20"
					>
						[send]
					</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Resizer + Info pane -->
	<PaneResizer bind:width={infoPaneWidth} min={250} max={700} side="right" storageKey="pane:info" />
	<div class="hidden shrink-0 overflow-auto pl-3 lg:block" style:width="{infoPaneWidth}px">
		<InfoPane
			commits={data.commits}
			committedDiff={data.committedDiff}
			committedStatus={data.committedStatus}
			uncommittedDiff={data.uncommittedDiff}
			uncommittedStatus={data.uncommittedStatus}
		/>
	</div>
</div>
