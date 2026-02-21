import { watch, type FSWatcher } from 'fs';

type WorktreeListener = () => void;

interface WatcherEntry {
	watcher: FSWatcher;
	listeners: Set<WorktreeListener>;
	debounceTimer: ReturnType<typeof setTimeout> | null;
}

const DEBOUNCE_MS = 300;

const watchers = new Map<string, WatcherEntry>();

function shouldIgnore(filename: string | null): boolean {
	if (!filename) return false;
	if (filename.startsWith('.git/') || filename.startsWith('.git\\')) return true;
	if (filename === '.git') return true;
	if (filename.startsWith('.servitor/') || filename.startsWith('.servitor\\')) return true;
	if (filename.endsWith('.swp') || filename.endsWith('~')) return true;
	if (filename === '.DS_Store' || filename === '4913') return true;
	return false;
}

/**
 * Subscribe to filesystem changes in a worktree directory.
 * Starts a recursive fs.watch on first subscriber, stops on last unsubscribe.
 * Events are debounced — rapid changes collapse into a single notification.
 * Returns an unsubscribe function.
 */
export function subscribeWorktreeChanges(
	worktreePath: string,
	listener: WorktreeListener
): () => void {
	let entry = watchers.get(worktreePath);

	if (!entry) {
		const fsWatcher = watch(worktreePath, { recursive: true }, (_eventType, filename) => {
			if (shouldIgnore(filename as string | null)) return;

			const e = watchers.get(worktreePath);
			if (!e) return;

			if (e.debounceTimer) clearTimeout(e.debounceTimer);
			e.debounceTimer = setTimeout(() => {
				e.debounceTimer = null;
				for (const fn of e.listeners) fn();
			}, DEBOUNCE_MS);
		});

		// Silently handle watcher errors (e.g. directory deleted)
		fsWatcher.on('error', () => {});

		entry = { watcher: fsWatcher, listeners: new Set(), debounceTimer: null };
		watchers.set(worktreePath, entry);
	}

	entry.listeners.add(listener);

	return () => {
		const e = watchers.get(worktreePath);
		if (!e) return;

		e.listeners.delete(listener);

		if (e.listeners.size === 0) {
			if (e.debounceTimer) clearTimeout(e.debounceTimer);
			e.watcher.close();
			watchers.delete(worktreePath);
		}
	};
}

/** Close all watchers. Call on process shutdown. */
export function closeAllWatchers(): void {
	for (const [, entry] of watchers) {
		if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
		entry.watcher.close();
	}
	watchers.clear();
}
