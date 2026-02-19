import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Mock config before importing git module (config runs execSync at load time)
vi.mock('./config', () => ({
	config: {
		repoPath: '/fake/repo',
		worktreesDir: '/fake/worktrees',
		projectSlug: 'test-project',
		projectName: 'Test Project'
	}
}));

vi.mock('child_process');
vi.mock('fs');

const mockedExecSync = vi.mocked(execSync);
const mockedExistsSync = vi.mocked(existsSync);

import { getCommits, getDefaultBranch, getStatus, getUncommittedStatus } from './git';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('getCommits', () => {
	it('returns empty array for empty log output', () => {
		mockedExecSync.mockReturnValue('');

		expect(getCommits('/worktree', 'main')).toEqual([]);
	});

	it('parses commit log in groups of 4 lines', () => {
		const log = [
			'abc1234567890',
			'Fix the bug',
			'Alice',
			'2024-01-15 10:30:00 +0000',
			'def9876543210',
			'Add feature',
			'Bob',
			'2024-01-14 09:00:00 +0000'
		].join('\n');

		mockedExecSync.mockReturnValue(log);

		const commits = getCommits('/worktree', 'main');
		expect(commits).toHaveLength(2);
		expect(commits[0]).toEqual({
			hash: 'abc1234567890',
			message: 'Fix the bug',
			author: 'Alice',
			date: '2024-01-15 10:30:00 +0000'
		});
		expect(commits[1]).toEqual({
			hash: 'def9876543210',
			message: 'Add feature',
			author: 'Bob',
			date: '2024-01-14 09:00:00 +0000'
		});
	});

	it('drops trailing incomplete group (fewer than 4 remaining lines)', () => {
		const log = [
			'abc123',
			'Full commit',
			'Alice',
			'2024-01-15 10:30:00 +0000',
			'def456',
			'Incomplete commit',
			'Bob'
			// missing date line
		].join('\n');

		mockedExecSync.mockReturnValue(log);

		const commits = getCommits('/worktree', 'main');
		expect(commits).toHaveLength(1);
		expect(commits[0].hash).toBe('abc123');
	});

	it('returns empty array on execSync error', () => {
		mockedExecSync.mockImplementation(() => {
			throw new Error('git error');
		});

		expect(getCommits('/worktree', 'main')).toEqual([]);
	});
});

describe('getDefaultBranch', () => {
	it('returns the current branch name', () => {
		mockedExecSync.mockReturnValue('develop\n');

		expect(getDefaultBranch()).toBe('develop');
	});

	it('falls back to "main" on error', () => {
		mockedExecSync.mockImplementation(() => {
			throw new Error('not a git repo');
		});

		expect(getDefaultBranch()).toBe('main');
	});
});

describe('getStatus (parseDiffStatus integration)', () => {
	it('returns empty array when name-status is empty', () => {
		mockedExecSync.mockReturnValue('');

		expect(getStatus('/worktree', 'main')).toEqual([]);
	});

	it('parses file statuses from name-status output', () => {
		// First call: git diff --name-status
		// Second call: git diff --numstat
		// Note: git --name-status uses tab-separated "CODE\tpath", and renames
		// include the similarity score attached to the code like "R100\told\tnew"
		mockedExecSync
			.mockReturnValueOnce('M\tsrc/app.ts\nA\tsrc/new.ts\nD\tsrc/old.ts')
			.mockReturnValueOnce('10\t2\tsrc/app.ts\n15\t0\tsrc/new.ts\n0\t8\tsrc/old.ts');

		const files = getStatus('/worktree', 'main');
		expect(files).toHaveLength(3);
		expect(files[0]).toEqual({
			path: 'src/app.ts',
			status: 'modified',
			additions: 10,
			deletions: 2
		});
		expect(files[1]).toEqual({
			path: 'src/new.ts',
			status: 'added',
			additions: 15,
			deletions: 0
		});
		expect(files[2]).toEqual({
			path: 'src/old.ts',
			status: 'deleted',
			additions: 0,
			deletions: 8
		});
	});

	it('handles binary files in numstat (- instead of numbers)', () => {
		mockedExecSync
			.mockReturnValueOnce('A\timage.png')
			.mockReturnValueOnce('-\t-\timage.png');

		const files = getStatus('/worktree', 'main');
		expect(files[0]).toEqual({
			path: 'image.png',
			status: 'added',
			additions: 0,
			deletions: 0
		});
	});

	it('returns empty array on error', () => {
		mockedExecSync.mockImplementation(() => {
			throw new Error('git error');
		});

		expect(getStatus('/worktree', 'main')).toEqual([]);
	});
});

describe('getUncommittedStatus', () => {
	it('includes untracked files', () => {
		// First call: git diff --name-status HEAD
		mockedExecSync
			.mockReturnValueOnce('M\tsrc/changed.ts')
			// Second call: git diff --numstat HEAD
			.mockReturnValueOnce('5\t1\tsrc/changed.ts')
			// Third call: git ls-files --others --exclude-standard
			.mockReturnValueOnce('src/untracked.ts');

		const files = getUncommittedStatus('/worktree');
		expect(files).toHaveLength(2);
		expect(files[0].status).toBe('modified');
		expect(files[1]).toEqual({
			path: 'src/untracked.ts',
			status: 'untracked',
			additions: 0,
			deletions: 0
		});
	});
});
