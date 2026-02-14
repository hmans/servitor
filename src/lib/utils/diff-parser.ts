export interface DiffLine {
	type: 'addition' | 'deletion' | 'context';
	content: string;
	oldLineNo: number | null;
	newLineNo: number | null;
}

export interface DiffHunk {
	header: string;
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: DiffLine[];
}

export interface DiffFile {
	displayPath: string;
	additions: number;
	deletions: number;
	hunks: DiffHunk[];
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseDiff(raw: string): DiffFile[] {
	const files: DiffFile[] = [];
	const lines = raw.split('\n');

	let currentFile: DiffFile | null = null;
	let currentHunk: DiffHunk | null = null;
	let oldLine = 0;
	let newLine = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// New file
		if (line.startsWith('diff --git ')) {
			const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
			currentFile = {
				displayPath: match ? match[2] : 'unknown',
				additions: 0,
				deletions: 0,
				hunks: []
			};
			files.push(currentFile);
			currentHunk = null;
			continue;
		}

		// Skip metadata lines before hunks
		if (
			!currentHunk &&
			(line.startsWith('index ') ||
				line.startsWith('old mode') ||
				line.startsWith('new mode') ||
				line.startsWith('new file mode') ||
				line.startsWith('deleted file mode') ||
				line.startsWith('similarity index') ||
				line.startsWith('rename from') ||
				line.startsWith('rename to') ||
				line.startsWith('copy from') ||
				line.startsWith('copy to') ||
				line.startsWith('--- ') ||
				line.startsWith('+++ ') ||
				line.startsWith('Binary files'))
		) {
			continue;
		}

		// Hunk header
		const hunkMatch = line.match(HUNK_HEADER_RE);
		if (hunkMatch && currentFile) {
			oldLine = parseInt(hunkMatch[1], 10);
			newLine = parseInt(hunkMatch[3], 10);
			currentHunk = {
				header: line,
				oldStart: oldLine,
				oldCount: parseInt(hunkMatch[2] ?? '1', 10),
				newStart: newLine,
				newCount: parseInt(hunkMatch[4] ?? '1', 10),
				lines: []
			};
			currentFile.hunks.push(currentHunk);
			continue;
		}

		// Diff body lines
		if (currentHunk && currentFile) {
			if (line.startsWith('+')) {
				currentHunk.lines.push({
					type: 'addition',
					content: line.slice(1),
					oldLineNo: null,
					newLineNo: newLine++
				});
				currentFile.additions++;
			} else if (line.startsWith('-')) {
				currentHunk.lines.push({
					type: 'deletion',
					content: line.slice(1),
					oldLineNo: oldLine++,
					newLineNo: null
				});
				currentFile.deletions++;
			} else if (line.startsWith(' ') || line === '') {
				// Context line (or empty trailing line)
				if (currentHunk.lines.length > 0 || line.startsWith(' ')) {
					currentHunk.lines.push({
						type: 'context',
						content: line.startsWith(' ') ? line.slice(1) : line,
						oldLineNo: oldLine++,
						newLineNo: newLine++
					});
				}
			}
		}
	}

	return files;
}
