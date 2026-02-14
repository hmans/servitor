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

/** Derive a filesystem-safe slug from a project name */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
