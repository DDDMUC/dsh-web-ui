import { describe, expect, it } from 'vitest'
import { MapScanCache, NotAGitRepositoryError, scanGitLog } from '../src/git.ts'
import type { CommitDelta } from '../src/kline.ts'

/** Deterministic fake git runner keyed by the window string in the args. */
function fakeRun(
  history: Map<string, CommitDelta[]>,
): (cwd: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }> {
  return async (_cwd, args) => {
    const sinceIndex = args.indexOf('--since')
    const since = sinceIndex === -1 ? undefined : args[sinceIndex + 1]
    if (since !== undefined && since.includes('not-a-repo')) {
      return { stdout: '', stderr: 'fatal: not a git repository (or any of the parent directories): .git' }
    }
    const deltas = since === undefined ? history.get('full') ?? [] : history.get(since) ?? []
    const stdout = deltas
      .map(d => `commit ${d.sha}\nDate:   ${d.timestamp}\n\n${d.added}\t${d.deleted}\tsrc/file.ts`)
      .join('\n')
    return { stdout, stderr: '' }
  }
}

const FULL: CommitDelta[] = [
  { sha: 'aaa', timestamp: '2026-08-01T09:00:00+08:00', added: 10, deleted: 0 },
  { sha: 'bbb', timestamp: '2026-08-02T09:00:00+08:00', added: 5, deleted: 2 },
]
const INCREMENT: CommitDelta[] = [
  { sha: 'bbb', timestamp: '2026-08-02T09:00:00+08:00', added: 5, deleted: 2 },
  { sha: 'ccc', timestamp: '2026-08-03T09:00:00+08:00', added: 8, deleted: 1 },
]

describe('scanGitLog', () => {
  it('full-scans on cache miss and caches the entry', async () => {
    const cache = new MapScanCache()
    const run = fakeRun(new Map([['full', FULL]]))
    const deltas = await scanGitLog('/ws', undefined, cache, run)
    expect(deltas.map(d => d.sha)).toEqual(['aaa', 'bbb'])
    expect(cache.get('/ws')).toBeDefined()
  })

  it('incremental refresh merges only new commits, de-duplicating by sha', async () => {
    const cache = new MapScanCache()
    const run = fakeRun(new Map([
      ['full', FULL],
      // Incremental window re-emits bbb plus the new ccc.
      [new Date(Date.parse('2026-08-01T09:00:00+08:00') - 3600_000).toISOString(), INCREMENT],
    ]))
    await scanGitLog('/ws', undefined, cache, run)
    const merged = await scanGitLog('/ws', undefined, cache, run)
    expect(merged.map(d => d.sha)).toEqual(['aaa', 'bbb', 'ccc'])
    expect(merged[2]!.added).toBe(8)
  })

  it('no new commits returns the cached list without changing it', async () => {
    const cache = new MapScanCache()
    const run = fakeRun(new Map([
      ['full', FULL],
      [new Date(Date.parse('2026-08-01T09:00:00+08:00') - 3600_000).toISOString(), []],
    ]))
    await scanGitLog('/ws', undefined, cache, run)
    const again = await scanGitLog('/ws', undefined, cache, run)
    expect(again.map(d => d.sha)).toEqual(['aaa', 'bbb'])
  })

  it('surfaces NotAGitRepositoryError when git says so', async () => {
    const cache = new MapScanCache()
    const run = fakeRun(new Map([['full-not-a-repo', []]]))
    await expect(scanGitLog('/ws', 'not-a-repo', cache, run)).rejects.toBeInstanceOf(NotAGitRepositoryError)
  })

  it('empty repository resolves to an empty delta list', async () => {
    const cache = new MapScanCache()
    const run = fakeRun(new Map([['full', []]]))
    const deltas = await scanGitLog('/ws', undefined, cache, run)
    expect(deltas).toEqual([])
  })

  it('evicts oldest entries at the cap', () => {
    const cache = new MapScanCache(2)
    cache.set('/a', { deltas: [], since: undefined, scannedAt: 1 })
    cache.set('/b', { deltas: [], since: undefined, scannedAt: 2 })
    cache.set('/c', { deltas: [], since: undefined, scannedAt: 3 })
    expect(cache.get('/a')).toBeUndefined()
    expect(cache.get('/b')).toBeDefined()
    expect(cache.get('/c')).toBeDefined()
  })
})
