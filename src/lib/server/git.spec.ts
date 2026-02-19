import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

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
const mockedMkdirSync = vi.mocked(mkdirSync);

import { createWorktree, getCommits, getDefaultBranch, getStatus, getUncommittedStatus } from './git';

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
	it('returns "main" when main branch exists', () => {
		// git rev-parse --verify refs/heads/main succeeds
		mockedExecSync.mockReturnValueOnce('sha\n');

		expect(getDefaultBranch()).toBe('main');
	});

	it('returns "master" when main does not exist but master does', () => {
		mockedExecSync
			// git rev-parse --verify refs/heads/main fails
			.mockImplementationOnce(() => {
				throw new Error('not a valid ref');
			})
			// git rev-parse --verify refs/heads/master succeeds
			.mockReturnValueOnce('sha\n');

		expect(getDefaultBranch()).toBe('master');
	});

	it('falls back to HEAD when neither main nor master exist', () => {
		mockedExecSync
			// main check fails
			.mockImplementationOnce(() => {
				throw new Error('not a valid ref');
			})
			// master check fails
			.mockImplementationOnce(() => {
				throw new Error('not a valid ref');
			})
			// git symbolic-ref --short HEAD succeeds
			.mockReturnValueOnce('develop\n');

		expect(getDefaultBranch()).toBe('develop');
	});

	it('falls back to "main" when everything fails', () => {
		mockedExecSync.mockImplementation(() => {
			throw new Error('not a git repo');
		});

		expect(getDefaultBranch()).toBe('main');
	});
});

describe('createWorktree', () => {
	it('creates worktree branching from the default branch', () => {
		mockedExistsSync.mockReturnValue(false);
		// Call sequence:
		// 1. getDefaultBranch -> git rev-parse --verify refs/heads/main (succeeds)
		// 2. git worktree add -b ...
		mockedExecSync
			.mockReturnValueOnce('sha\n') // main exists
			.mockReturnValueOnce(''); // worktree add

		const result = createWorktree('fix-bug');

		expect(result).toEqual({
			branch: 'servitor/fix-bug',
			worktreePath: '/fake/worktrees/test-project/fix-bug'
		});
		// Verify mkdirSync was called for parent directory
		expect(mockedMkdirSync).toHaveBeenCalledWith('/fake/worktrees/test-project', {
			recursive: true
		});
		// Verify the worktree add command includes the base branch
		expect(mockedExecSync).toHaveBeenCalledWith(
			expect.stringContaining('"main"'),
			expect.objectContaining({ cwd: '/fake/repo' })
		);
	});

	it('uses master as base when main does not exist', () => {
		mockedExistsSync.mockReturnValue(false);
		mockedExecSync
			.mockImplementationOnce(() => {
				throw new Error('not a valid ref');
			}) // main doesn't exist
			.mockReturnValueOnce('sha\n') // master exists
			.mockReturnValueOnce(''); // worktree add

		const result = createWorktree('fix-bug');

		expect(result.branch).toBe('servitor/fix-bug');
		expect(mockedExecSync).toHaveBeenLastCalledWith(
			expect.stringContaining('"master"'),
			expect.objectContaining({ cwd: '/fake/repo' })
		);
	});

	it('throws when worktree path already exists', () => {
		mockedExistsSync.mockReturnValue(true);

		expect(() => createWorktree('fix-bug')).toThrow('Worktree path already exists');
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
