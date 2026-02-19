import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';

export interface ServitorConfig {
	/** Absolute path to the git repository root */
	repoPath: string;
	/** Human-readable project name */
	projectName: string;
	/** Filesystem-safe slug derived from projectName */
	projectSlug: string;
	/** Base directory for all worktrees. Default: $HOME/servitor-worktrees */
	worktreesDir: string;
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function loadConfig(): ServitorConfig {
	// Resolve repo root from CWD
	let repoPath: string;
	try {
		repoPath = execSync('git rev-parse --show-toplevel', {
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe']
		}).trim();
	} catch {
		throw new Error('Servitor must be launched from within a git repository.');
	}

	// Load optional .servitor.yml from repo root
	const yamlPath = join(repoPath, '.servitor.yml');
	let yaml: Record<string, unknown> = {};

	if (existsSync(yamlPath)) {
		try {
			yaml = parseYaml(readFileSync(yamlPath, 'utf-8')) ?? {};
		} catch (e) {
			console.warn(`[config] Failed to parse ${yamlPath}, using defaults:`, e);
		}
	}

	const projectName =
		typeof yaml.name === 'string' ? yaml.name : basename(repoPath);

	const worktreesDir =
		typeof yaml.worktreesDir === 'string'
			? yaml.worktreesDir.replace(/^~/, homedir())
			: join(homedir(), 'servitor-worktrees');

	// Ensure .servitor/ directory exists with a .gitignore
	const servitorDir = join(repoPath, '.servitor');
	mkdirSync(servitorDir, { recursive: true });

	const gitignorePath = join(servitorDir, '.gitignore');
	if (!existsSync(gitignorePath)) {
		writeFileSync(gitignorePath, '*\n!.gitignore\n');
	}

	return {
		repoPath,
		projectName,
		projectSlug: slugify(projectName),
		worktreesDir
	};
}

/** Singleton config — loaded once at startup */
export const config: ServitorConfig = loadConfig();
