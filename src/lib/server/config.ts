import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';
import { logger } from './logger';

export interface ServitorConfig {
  /** Absolute path to the git repository root */
  repoPath: string;
  /** Human-readable project name */
  projectName: string;
  /** Filesystem-safe slug derived from projectName */
  projectSlug: string;
  /** Port for the Servitor server. Default: 5555 */
  port: number;
  /** Base directory for all worktrees. Default: $HOME/.servitor/worktrees */
  worktreesDir: string;
  /** Whether Servitor was launched from the main working tree (not a linked worktree) */
  isMainWorktree: boolean;
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
      logger.warn({ err: e, path: yamlPath }, 'Failed to parse config, using defaults');
    }
  }

  // Support nested `servitor:` key from .servitor.yml
  const servitorYaml = (typeof yaml.servitor === 'object' && yaml.servitor !== null
    ? yaml.servitor
    : {}) as Record<string, unknown>;

  const projectName = typeof yaml.name === 'string' ? yaml.name : basename(repoPath);

  const port =
    typeof servitorYaml.port === 'number'
      ? servitorYaml.port
      : 5555;

  const projectSlug = slugify(projectName);

  const rawWorktrees = servitorYaml.worktrees ?? yaml.worktreesDir;
  const worktreesDir =
    typeof rawWorktrees === 'string'
      ? rawWorktrees.replace(/^~/, homedir())
      : join(homedir(), '.servitor', 'worktrees', projectSlug);

  // Detect whether we're in the main working tree or a linked worktree.
  // In a linked worktree, --git-dir points to .git/worktrees/<name> while
  // --git-common-dir points to the main .git directory.
  let isMainWorktree = true;
  try {
    const gitDir = execSync('git rev-parse --path-format=absolute --git-dir', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    const commonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    isMainWorktree = gitDir === commonDir;
  } catch {
    // If detection fails, assume main worktree
  }

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
    projectSlug,
    port,
    worktreesDir,
    isMainWorktree
  };
}

/** Singleton config — loaded once at startup */
export const config: ServitorConfig = loadConfig();
