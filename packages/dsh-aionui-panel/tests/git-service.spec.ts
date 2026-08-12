/**
 * GitService behavior tests with a fake runner + gate: stage/unstage batch
 * plumbing, and the discard path — tracked files restore through git while
 * untracked files delete through the fs seam, with the membership check on
 * the ABSOLUTE path (regression: comparing repo-relative paths against the
 * resolved absolute list silently failed every discard).
 */
import { describe, expect, it, vi } from 'vitest'
import { GitService, type GitRunner } from '../src/host/git-service.ts'
import type { WorkspaceGate } from '../src/host/gate.ts'

const ROOT = '/w'
const REPO = '/w'

/** A runner recording argv, canned per-command. */
function fakeRunner(): { runner: GitRunner; calls: string[][] } {
  const calls: string[][] = []
  const runner: GitRunner = {
    async run(argv, cwd) {
      calls.push([...argv, `@${cwd}`])
      const command = argv[0]
      if (command === 'rev-parse' && argv[1] === '--show-toplevel') {
        return { exitCode: 0, stdout: `${REPO}\n`, stderr: '' }
      }
      if (command === 'rev-parse' && argv[1] === '--abbrev-ref') {
        return { exitCode: 0, stdout: 'main\n', stderr: '' }
      }
      if (command === 'status') {
        return { exitCode: 0, stdout: 'M  tracked.txt\0?? new.txt\0', stderr: '' }
      }
      if (command === 'ls-files') {
        // --error-unmatch fails for untracked paths.
        return argv.includes('new.txt')
          ? { exitCode: 1, stdout: '', stderr: 'no match' }
          : { exitCode: 0, stdout: '', stderr: '' }
      }
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  return { runner, calls }
}

const gate: WorkspaceGate = async (root) => ({ ok: true, canonical: root })

describe('GitService.discard', () => {
  it('deletes untracked files through the fs seam (absolute membership check)', async () => {
    const { runner, calls } = fakeRunner()
    const fsDelete = vi.fn(async () => ({ ok: true as const }))
    const service = new GitService(runner, gate, fsDelete)

    const result = await service.discard(ROOT, ['new.txt'])
    expect(result).toEqual({ applied: ['new.txt'], failed: [] })
    expect(fsDelete).toHaveBeenCalledWith(ROOT, 'new.txt')
  })

  it('restores tracked files through git and never touches the fs seam', async () => {
    const { runner, calls } = fakeRunner()
    const fsDelete = vi.fn(async () => ({ ok: true as const }))
    const service = new GitService(runner, gate, fsDelete)

    const result = await service.discard(ROOT, ['tracked.txt'])
    expect(result).toEqual({ applied: ['tracked.txt'], failed: [] })
    expect(fsDelete).not.toHaveBeenCalled()
    expect(calls.some((call) => call[0] === 'restore' && call[1] === '--worktree')).toBe(true)
  })

  it('rejects paths outside the repo root', async () => {
    const { runner, calls } = fakeRunner()
    const service = new GitService(runner, gate, vi.fn(async () => ({ ok: true as const })))
    const result = await service.discard(ROOT, ['../outside.txt'])
    expect(result).toEqual({ applied: [], failed: ['../outside.txt'] })
  })

  it('reports fs-seam failures in failed[]', async () => {
    const { runner, calls } = fakeRunner()
    const service = new GitService(runner, gate, vi.fn(async () => ({
      code: 'write-failed' as const,
      message: 'nope',
    })))
    const result = await service.discard(ROOT, ['new.txt'])
    expect(result).toEqual({ applied: [], failed: ['new.txt'] })
  })
})

describe('GitService.stage/unstage', () => {
  it('stages through git add and reports outside paths as failed', async () => {
    const { runner, calls } = fakeRunner()
    const service = new GitService(runner, gate, vi.fn(async () => ({ ok: true as const })))
    const result = await service.stage(ROOT, ['new.txt', '../evil.txt'])
    expect(result.applied).toEqual(['new.txt'])
    expect(result.failed).toEqual(['../evil.txt'])
    expect(calls.some((call) => call[0] === 'add')).toBe(true)
  })

  it('unstages through git restore --staged', async () => {
    const { runner, calls } = fakeRunner()
    const service = new GitService(runner, gate, vi.fn(async () => ({ ok: true as const })))
    const result = await service.unstage(ROOT, ['tracked.txt'])
    expect(result.applied).toEqual(['tracked.txt'])
    expect(calls.some((call) => call[0] === 'restore' && call[1] === '--staged')).toBe(true)
  })
})
