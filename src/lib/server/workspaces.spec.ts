import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// Mock config before importing (it runs execSync at module load)
const mockConfig = vi.hoisted(() => ({
  repoPath: '/fake/repo',
  worktreesDir: '/fake/worktrees/test-project',
  projectSlug: 'test-project',
  projectName: 'Test Project',
  port: 5555,
  isMainWorktree: true
}));

vi.mock('./config', () => ({
  config: mockConfig
}));

vi.mock('child_process');

// Mock git module since workspaces imports it
vi.mock('./git', () => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  getDefaultBranch: vi.fn(() => 'main')
}));

const mockedExecSync = vi.mocked(execSync);

import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  deleteWorkspace,
  MAIN_WORKSPACE_NAME
} from './workspaces';
import { createWorktree } from './git';

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig.isMainWorktree = true;
});

describe('listWorkspaces', () => {
  it('always includes main workspace first', () => {
    mockedExecSync.mockReturnValue('');

    const workspaces = listWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toEqual({
      name: MAIN_WORKSPACE_NAME,
      branch: 'main',
      worktreePath: '/fake/repo',
      isMainWorkspace: true
    });
  });

  it('returns main workspace + empty array when git command fails', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    const workspaces = listWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].isMainWorkspace).toBe(true);
  });

  it('parses porcelain output and filters servitor/ branches', () => {
    const porcelain = [
      'worktree /home/user/repo',
      'HEAD abc1234',
      'branch refs/heads/main',
      '',
      'worktree /fake/worktrees/test-project/fix-bug',
      'HEAD def5678',
      'branch refs/heads/servitor/fix-bug',
      '',
      'worktree /fake/worktrees/test-project/add-feature',
      'HEAD 9876543',
      'branch refs/heads/servitor/add-feature'
    ].join('\n');

    mockedExecSync.mockReturnValue(porcelain);

    const workspaces = listWorkspaces();
    // Main workspace + 2 worktree workspaces
    expect(workspaces).toHaveLength(3);
    expect(workspaces[0]).toEqual({
      name: MAIN_WORKSPACE_NAME,
      branch: 'main',
      worktreePath: '/fake/repo',
      isMainWorkspace: true
    });
    // Sorted alphabetically after main
    expect(workspaces[1]).toEqual({
      name: 'add-feature',
      branch: 'servitor/add-feature',
      worktreePath: '/fake/worktrees/test-project/add-feature',
      isMainWorkspace: false
    });
    expect(workspaces[2]).toEqual({
      name: 'fix-bug',
      branch: 'servitor/fix-bug',
      worktreePath: '/fake/worktrees/test-project/fix-bug',
      isMainWorkspace: false
    });
  });

  it('skips detached HEAD worktrees (no branch line)', () => {
    const porcelain = [
      'worktree /fake/worktrees/test-project/detached',
      'HEAD abc1234',
      'detached',
      '',
      'worktree /fake/worktrees/test-project/normal',
      'HEAD def5678',
      'branch refs/heads/servitor/normal'
    ].join('\n');

    mockedExecSync.mockReturnValue(porcelain);

    const workspaces = listWorkspaces();
    expect(workspaces).toHaveLength(2); // main + normal
    expect(workspaces[1].name).toBe('normal');
  });

  it('skips non-servitor branches', () => {
    const porcelain = [
      'worktree /some/path',
      'HEAD abc1234',
      'branch refs/heads/feature/something',
      '',
      'worktree /other/path',
      'HEAD def5678',
      'branch refs/heads/servitor/my-workspace'
    ].join('\n');

    mockedExecSync.mockReturnValue(porcelain);

    const workspaces = listWorkspaces();
    expect(workspaces).toHaveLength(2); // main + my-workspace
    expect(workspaces[1].name).toBe('my-workspace');
  });
});

describe('getWorkspace', () => {
  it('returns main workspace for main-workspace name', () => {
    const ws = getWorkspace(MAIN_WORKSPACE_NAME);
    expect(ws).toEqual({
      name: MAIN_WORKSPACE_NAME,
      branch: 'main',
      worktreePath: '/fake/repo',
      isMainWorkspace: true
    });
    // Should not call execSync (no git worktree list needed)
    expect(mockedExecSync).not.toHaveBeenCalled();
  });

  it('returns matching workspace', () => {
    const porcelain = [
      'worktree /fake/worktrees/test-project/target',
      'HEAD abc1234',
      'branch refs/heads/servitor/target'
    ].join('\n');

    mockedExecSync.mockReturnValue(porcelain);

    const ws = getWorkspace('target');
    expect(ws).toEqual({
      name: 'target',
      branch: 'servitor/target',
      worktreePath: '/fake/worktrees/test-project/target',
      isMainWorkspace: false
    });
  });

  it('returns undefined for non-existent workspace', () => {
    mockedExecSync.mockReturnValue('');

    expect(getWorkspace('nope')).toBeUndefined();
  });
});

describe('createWorkspace', () => {
  it('throws when name is the reserved main workspace name', () => {
    expect(() => createWorkspace(MAIN_WORKSPACE_NAME)).toThrow(
      `"${MAIN_WORKSPACE_NAME}" is a reserved name`
    );
    expect(createWorktree).not.toHaveBeenCalled();
  });
});

describe('deleteWorkspace', () => {
  it('throws when trying to delete the main workspace', () => {
    expect(() => deleteWorkspace(MAIN_WORKSPACE_NAME)).toThrow(
      'Cannot delete the main workspace'
    );
  });
});

describe('when launched from a linked worktree', () => {
  beforeEach(() => {
    mockConfig.isMainWorktree = false;
  });

  it('listWorkspaces excludes main workspace', () => {
    const porcelain = [
      'worktree /fake/worktrees/test-project/fix-bug',
      'HEAD def5678',
      'branch refs/heads/servitor/fix-bug'
    ].join('\n');

    mockedExecSync.mockReturnValue(porcelain);

    const workspaces = listWorkspaces();
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe('fix-bug');
    expect(workspaces[0].isMainWorkspace).toBe(false);
  });

  it('listWorkspaces returns empty when no servitor worktrees exist', () => {
    mockedExecSync.mockReturnValue('');
    expect(listWorkspaces()).toEqual([]);
  });

  it('getWorkspace returns undefined for main-workspace', () => {
    expect(getWorkspace(MAIN_WORKSPACE_NAME)).toBeUndefined();
  });
});
