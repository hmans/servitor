import { describe, it, expect } from 'vitest';
import { parseDiff } from './diff-parser';

describe('parseDiff', () => {
	it('returns empty array for empty input', () => {
		expect(parseDiff('')).toEqual([]);
	});

	it('parses a single file with one addition', () => {
		const diff = [
			'diff --git a/hello.txt b/hello.txt',
			'new file mode 100644',
			'index 0000000..ce01362',
			'--- /dev/null',
			'+++ b/hello.txt',
			'@@ -0,0 +1 @@',
			'+hello world'
		].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].displayPath).toBe('hello.txt');
		expect(files[0].additions).toBe(1);
		expect(files[0].deletions).toBe(0);
		expect(files[0].hunks).toHaveLength(1);
		expect(files[0].hunks[0].lines).toEqual([
			{ type: 'addition', content: 'hello world', oldLineNo: null, newLineNo: 1 }
		]);
	});

	it('parses a modification with additions, deletions, and context', () => {
		const diff = [
			'diff --git a/src/app.ts b/src/app.ts',
			'index abc1234..def5678 100644',
			'--- a/src/app.ts',
			'+++ b/src/app.ts',
			'@@ -1,5 +1,5 @@',
			' import { foo } from "bar";',
			'-const old = true;',
			'+const updated = false;',
			' ',
			' export default foo;'
		].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);

		const file = files[0];
		expect(file.displayPath).toBe('src/app.ts');
		expect(file.additions).toBe(1);
		expect(file.deletions).toBe(1);

		const lines = file.hunks[0].lines;
		expect(lines).toHaveLength(5);
		expect(lines[0]).toEqual({
			type: 'context',
			content: 'import { foo } from "bar";',
			oldLineNo: 1,
			newLineNo: 1
		});
		expect(lines[1]).toEqual({
			type: 'deletion',
			content: 'const old = true;',
			oldLineNo: 2,
			newLineNo: null
		});
		expect(lines[2]).toEqual({
			type: 'addition',
			content: 'const updated = false;',
			oldLineNo: null,
			newLineNo: 2
		});
	});

	it('parses hunk headers with and without counts', () => {
		const diff = [
			'diff --git a/file.txt b/file.txt',
			'index abc..def 100644',
			'--- a/file.txt',
			'+++ b/file.txt',
			'@@ -10 +10 @@',
			'-old',
			'+new'
		].join('\n');

		const files = parseDiff(diff);
		const hunk = files[0].hunks[0];
		// Missing counts default to 1
		expect(hunk.oldStart).toBe(10);
		expect(hunk.oldCount).toBe(1);
		expect(hunk.newStart).toBe(10);
		expect(hunk.newCount).toBe(1);
	});

	it('parses hunk header with explicit counts', () => {
		const diff = [
			'diff --git a/file.txt b/file.txt',
			'index abc..def 100644',
			'--- a/file.txt',
			'+++ b/file.txt',
			'@@ -15,8 +20,12 @@ function foo() {',
			' context'
		].join('\n');

		const files = parseDiff(diff);
		const hunk = files[0].hunks[0];
		expect(hunk.oldStart).toBe(15);
		expect(hunk.oldCount).toBe(8);
		expect(hunk.newStart).toBe(20);
		expect(hunk.newCount).toBe(12);
		expect(hunk.header).toBe('@@ -15,8 +20,12 @@ function foo() {');
	});

	it('parses multiple files in one diff', () => {
		const diff = [
			'diff --git a/a.txt b/a.txt',
			'index abc..def 100644',
			'--- a/a.txt',
			'+++ b/a.txt',
			'@@ -1,2 +1,3 @@',
			' first',
			'+added',
			' second',
			'diff --git a/b.txt b/b.txt',
			'index abc..def 100644',
			'--- a/b.txt',
			'+++ b/b.txt',
			'@@ -1,3 +1,2 @@',
			' alpha',
			'-removed',
			' beta'
		].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(2);
		expect(files[0].displayPath).toBe('a.txt');
		expect(files[0].additions).toBe(1);
		expect(files[0].deletions).toBe(0);
		expect(files[1].displayPath).toBe('b.txt');
		expect(files[1].additions).toBe(0);
		expect(files[1].deletions).toBe(1);
	});

	it('parses multiple hunks in one file', () => {
		const diff = [
			'diff --git a/file.txt b/file.txt',
			'index abc..def 100644',
			'--- a/file.txt',
			'+++ b/file.txt',
			'@@ -1,3 +1,3 @@',
			' line1',
			'-old2',
			'+new2',
			' line3',
			'@@ -10,3 +10,3 @@',
			' line10',
			'-old11',
			'+new11',
			' line12'
		].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].hunks).toHaveLength(2);
		expect(files[0].hunks[0].oldStart).toBe(1);
		expect(files[0].hunks[1].oldStart).toBe(10);
		expect(files[0].additions).toBe(2);
		expect(files[0].deletions).toBe(2);
	});

	it('tracks line numbers correctly across additions and deletions', () => {
		const diff = [
			'diff --git a/file.txt b/file.txt',
			'index abc..def 100644',
			'--- a/file.txt',
			'+++ b/file.txt',
			'@@ -5,6 +5,7 @@',
			' context at 5',
			'-deleted at 6',
			'+added at 6',
			'+extra new line',
			' context at 7',
			' context at 8',
			' context at 9'
		].join('\n');

		const lines = parseDiff(diff)[0].hunks[0].lines;
		// context at 5: old=5, new=5
		expect(lines[0]).toMatchObject({ type: 'context', oldLineNo: 5, newLineNo: 5 });
		// deleted at 6: old=6, new=null
		expect(lines[1]).toMatchObject({ type: 'deletion', oldLineNo: 6, newLineNo: null });
		// added at 6: old=null, new=6
		expect(lines[2]).toMatchObject({ type: 'addition', oldLineNo: null, newLineNo: 6 });
		// extra new line: old=null, new=7
		expect(lines[3]).toMatchObject({ type: 'addition', oldLineNo: null, newLineNo: 7 });
		// context at 7: old=7, new=8
		expect(lines[4]).toMatchObject({ type: 'context', oldLineNo: 7, newLineNo: 8 });
	});

	it('skips metadata lines (rename, copy, binary, mode)', () => {
		const diff = [
			'diff --git a/old.txt b/new.txt',
			'similarity index 95%',
			'rename from old.txt',
			'rename to new.txt',
			'index abc..def 100644',
			'--- a/old.txt',
			'+++ b/new.txt',
			'@@ -1,2 +1,2 @@',
			' same',
			'-old line',
			'+new line'
		].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].displayPath).toBe('new.txt');
		expect(files[0].hunks).toHaveLength(1);
		expect(files[0].hunks[0].lines).toHaveLength(3);
	});

	it('handles binary file diff (no hunks)', () => {
		const diff = [
			'diff --git a/image.png b/image.png',
			'new file mode 100644',
			'index 0000000..abcdef1',
			'Binary files /dev/null and b/image.png differ'
		].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].displayPath).toBe('image.png');
		expect(files[0].hunks).toHaveLength(0);
		expect(files[0].additions).toBe(0);
		expect(files[0].deletions).toBe(0);
	});

	it('handles mode change metadata', () => {
		const diff = [
			'diff --git a/script.sh b/script.sh',
			'old mode 100644',
			'new mode 100755'
		].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].displayPath).toBe('script.sh');
		expect(files[0].hunks).toHaveLength(0);
	});

	it('handles file deletion', () => {
		const diff = [
			'diff --git a/removed.txt b/removed.txt',
			'deleted file mode 100644',
			'index abc1234..0000000',
			'--- a/removed.txt',
			'+++ /dev/null',
			'@@ -1,3 +0,0 @@',
			'-line one',
			'-line two',
			'-line three'
		].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].additions).toBe(0);
		expect(files[0].deletions).toBe(3);
	});

	it('handles diff with trailing newline', () => {
		const diff =
			[
				'diff --git a/file.txt b/file.txt',
				'index abc..def 100644',
				'--- a/file.txt',
				'+++ b/file.txt',
				'@@ -1 +1 @@',
				'-old',
				'+new'
			].join('\n') + '\n';

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].additions).toBe(1);
		expect(files[0].deletions).toBe(1);
	});

	it('falls back to "unknown" path for malformed diff header', () => {
		const diff = ['diff --git malformed line', '@@ -1 +1 @@', '+added'].join('\n');

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].displayPath).toBe('unknown');
	});
});
