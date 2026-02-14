import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

function run(cmd: string, cwd: string): string {
	return execSync(cmd, { cwd, encoding: 'utf-8' }).trim();
}

export function createWorktree(
	repoPath: string,
	worktreesDir: string,
	projectSlug: string,
	name: string
): { branch: string; worktreePath: string } {
	const branch = `servitor/${name}`;
	const worktreePath = join(worktreesDir, projectSlug, name);

	if (existsSync(worktreePath)) {
		throw new Error(`Worktree path already exists: ${worktreePath}`);
	}

	// Ensure parent directory exists
	mkdirSync(join(worktreesDir, projectSlug), { recursive: true });

	// Create branch from current HEAD and set up worktree
	run(`git worktree add -b "${branch}" "${worktreePath}"`, repoPath);

	return { branch, worktreePath };
}

export function removeWorktree(repoPath: string, worktreePath: string, branch: string): void {
	// Remove the worktree
	if (existsSync(worktreePath)) {
		run(`git worktree remove "${worktreePath}" --force`, repoPath);
	}

	// Delete the branch (ignore errors if already gone)
	try {
		run(`git branch -D "${branch}"`, repoPath);
	} catch {
		// Branch may already be deleted
	}
}

export function getDefaultBranch(repoPath: string): string {
	try {
		return run('git symbolic-ref --short HEAD', repoPath);
	} catch {
		return 'main';
	}
}

export interface Commit {
	hash: string;
	message: string;
	author: string;
	date: string;
}

export function getCommits(worktreePath: string, baseBranch: string): Commit[] {
	try {
		const log = run(
			`git log ${baseBranch}..HEAD --format=%H%n%s%n%an%n%ai --`,
			worktreePath
		);
		if (!log) return [];

		const lines = log.split('\n');
		const commits: Commit[] = [];
		for (let i = 0; i + 3 < lines.length; i += 4) {
			commits.push({
				hash: lines[i],
				message: lines[i + 1],
				author: lines[i + 2],
				date: lines[i + 3]
			});
		}
		return commits;
	} catch {
		return [];
	}
}

export function getDiff(worktreePath: string, baseBranch: string): string {
	try {
		return run(`git diff ${baseBranch}...HEAD`, worktreePath);
	} catch {
		return '';
	}
}

/** Derive a filesystem-safe slug from a project name */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
