import { execSync } from 'child_process';
import { config } from './config';
import {
  createWorktree as gitCreateWorktree,
  removeWorktree as gitRemoveWorktree,
  getDefaultBranch
} from './git';

export interface Workspace {
  /** Workspace name, e.g. "fix-bug" (derived from branch "servitor/fix-bug") */
  name: string;
  /** Full branch name, e.g. "servitor/fix-bug" */
  branch: string;
  /** Absolute path to the git worktree */
  worktreePath: string;
  /** Whether this is the permanent main branch workspace */
  isMainWorkspace: boolean;
}

export const MAIN_WORKSPACE_NAME = 'main-workspace';

const BRANCH_PREFIX = 'servitor/';

function getMainWorkspace(): Workspace {
  return {
    name: MAIN_WORKSPACE_NAME,
    branch: getDefaultBranch(),
    worktreePath: config.repoPath,
    isMainWorkspace: true
  };
}

/**
 * Parse `git worktree list --porcelain` output into Workspace objects.
 * Only includes worktrees on branches matching `servitor/*`.
 */
export function listWorkspaces(): Workspace[] {
  let output: string;
  try {
    output = execSync('git worktree list --porcelain', {
      cwd: config.repoPath,
      encoding: 'utf-8'
    }).trim();
  } catch {
    return config.isMainWorktree ? [getMainWorkspace()] : [];
  }

  if (!output) return config.isMainWorktree ? [getMainWorkspace()] : [];

  const workspaces: Workspace[] = [];

  // Porcelain output: blocks separated by blank lines
  // Each block has: worktree <path>\nHEAD <sha>\nbranch refs/heads/<name>
  for (const block of output.split('\n\n')) {
    const lines = block.split('\n');
    let worktreePath = '';
    let branch = '';

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktreePath = line.slice('worktree '.length);
      } else if (line.startsWith('branch refs/heads/')) {
        branch = line.slice('branch refs/heads/'.length);
      }
    }

    if (branch.startsWith(BRANCH_PREFIX) && worktreePath) {
      workspaces.push({
        name: branch.slice(BRANCH_PREFIX.length),
        branch,
        worktreePath,
        isMainWorkspace: false
      });
    }
  }

  const sorted = workspaces.sort((a, b) => a.name.localeCompare(b.name));
  return config.isMainWorktree ? [getMainWorkspace(), ...sorted] : sorted;
}

export function getWorkspace(name: string): Workspace | undefined {
  if (name === MAIN_WORKSPACE_NAME) {
    return config.isMainWorktree ? getMainWorkspace() : undefined;
  }
  return listWorkspaces().find((ws) => ws.name === name);
}

export function createWorkspace(name: string): Workspace {
  if (name === MAIN_WORKSPACE_NAME) {
    throw new Error(`"${MAIN_WORKSPACE_NAME}" is a reserved name`);
  }
  const { branch, worktreePath } = gitCreateWorktree(name);
  return { name, branch, worktreePath, isMainWorkspace: false };
}

export function deleteWorkspace(name: string): void {
  if (name === MAIN_WORKSPACE_NAME) {
    throw new Error('Cannot delete the main workspace');
  }
  const ws = getWorkspace(name);
  if (!ws) return;
  gitRemoveWorktree(ws.worktreePath, ws.branch);
}
