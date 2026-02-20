import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'child_process';

// Mock config before importing (it runs execSync at module load)
vi.mock('./config', () => ({
  config: {
    repoPath: '/fake/repo',
    worktreesDir: '/fake/worktrees',
    projectSlug: 'test-project',
    projectName: 'Test Project',
    port: 5555
  }
}));

vi.mock('child_process');

// Mock git module since workspaces imports it
vi.mock('./git', () => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn()
}));

const mockedExecSync = vi.mocked(execSync);

import { listWorkspaces, getWorkspace } from './workspaces';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listWorkspaces', () => {
  it('returns empty array when git command fails', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });

    expect(listWorkspaces()).toEqual([]);
  });

  it('returns empty array for empty output', () => {
    mockedExecSync.mockReturnValue('');

    expect(listWorkspaces()).toEqual([]);
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
    expect(workspaces).toHaveLength(2);
    // Sorted alphabetically
    expect(workspaces[0]).toEqual({
      name: 'add-feature',
      branch: 'servitor/add-feature',
      worktreePath: '/fake/worktrees/test-project/add-feature'
    });
    expect(workspaces[1]).toEqual({
      name: 'fix-bug',
      branch: 'servitor/fix-bug',
      worktreePath: '/fake/worktrees/test-project/fix-bug'
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
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe('normal');
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
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe('my-workspace');
  });
});

describe('getWorkspace', () => {
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
      worktreePath: '/fake/worktrees/test-project/target'
    });
  });

  it('returns undefined for non-existent workspace', () => {
    mockedExecSync.mockReturnValue('');

    expect(getWorkspace('nope')).toBeUndefined();
  });
});
