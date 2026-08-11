/**
 * Git invocation for code-kline: run `git log --numstat` in a workspace
 * directory and cache per-directory results so repeated polling does not
 * rescan large repositories.
 *
 * The cache is a simple in-memory LRU keyed by canonical directory path. It
 * stores the parsed commit deltas plus the wall-clock time of the last scan;
 * a refresh re-runs git with `--since` from the oldest cached commit (plus a
 * safety margin), merges the new deltas, and prunes cached shas the fresh
 * window no longer emits (amended/rebased commits), so steady-state polls
 * only pay for new commits. Cache misses run the full window and rebuild.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CommitDelta } from './kline.ts'
import { gitLogCommand, parseGitLog, sortChronological } from './kline.ts'

const execFileAsync = promisify(execFile)

/** One cache entry: parsed commits plus the window they were scanned with. */
interface CacheEntry {
  /** Commit deltas, chronological, covering every commit in `since`. */
  deltas: CommitDelta[]
  /** The `--since` window these deltas cover (undefined = full history). */
  since: string | undefined
  /** Wall-clock ms of the last successful scan. */
  scannedAt: number
}

/** Freshness window for a full re-scan when the caller changes the request window. */
const SCAN_MARGIN_MS = 60 * 60 * 1000

/** Error surfaced when a workspace directory is not a git repository. */
export class NotAGitRepositoryError extends Error {
  constructor(readonly dir: string, readonly stderr: string) {
    super(`'${dir}' is not a git repository: ${stderr.trim()}`)
    this.name = 'NotAGitRepositoryError'
  }
}

/**
 * In-memory per-directory scan cache. Methods are async only to allow a
 * future storage-backed implementation; the interface stays the seam.
 */
export interface ScanCache {
  get(dir: string): CacheEntry | undefined
  set(dir: string, entry: CacheEntry): void
  delete(dir: string): void
}

/** Default {@link ScanCache}: a plain Map with an entry cap (FIFO eviction). */
export class MapScanCache implements ScanCache {
  private readonly entries = new Map<string, CacheEntry>()

  constructor(private readonly cap = 64) {}

  get(dir: string): CacheEntry | undefined {
    return this.entries.get(dir)
  }

  set(dir: string, entry: CacheEntry): void {
    if (this.entries.size >= this.cap && !this.entries.has(dir)) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(dir, entry)
  }

  delete(dir: string): void {
    this.entries.delete(dir)
  }
}

/**
 * Scan one directory's git history into commit deltas, using the cache when
 * possible. Throws {@link NotAGitRepositoryError} when git reports the
 * directory is not a repository (exit 128 + 'not a git repository').
 * @param dir - workspace directory (must be a git repository).
 * @param since - requested window, e.g. '120 days ago'; undefined = full history.
 * @param cache - scan cache; pass a fresh one to disable persistence.
 * @returns chronological commit deltas covering the requested window.
 */
export async function scanGitLog(
  dir: string,
  since: string | undefined,
  cache: ScanCache,
  run: (cwd: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }> = defaultRun,
): Promise<CommitDelta[]> {
  const entry = cache.get(dir)
  // Cached scan covers a window at least as old as the request (same or
  // fuller history): reuse and only pull commits newer than the oldest
  // cached one (SCAN_MARGIN_MS back for clock skew).
  const reuse = entry !== undefined && (since === undefined || entry.since === undefined || entry.since <= since)
  if (reuse) {
    const oldest = entry.deltas[0]?.timestamp
    if (oldest === undefined) return [] // empty repo, nothing new can appear without re-scan
    const margin = new Date(Date.parse(oldest) - SCAN_MARGIN_MS).toISOString()
    const fresh = await runGitLog(dir, margin, run)
    if (fresh.deltas.length === 0) {
      entry.scannedAt = Date.now()
      return entry.deltas
    }
    const merged = mergeBySha(entry.deltas, fresh.deltas, margin)
    cache.set(dir, { deltas: merged, since: entry.since, scannedAt: Date.now() })
    return merged
  }
  const full = await runGitLog(dir, since, run)
  cache.set(dir, { deltas: full.deltas, since, scannedAt: Date.now() })
  return full.deltas
}

async function runGitLog(
  dir: string,
  since: string | undefined,
  run: (cwd: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>,
): Promise<{ deltas: CommitDelta[] }> {
  const { cwd, args } = gitLogCommand(dir, since)
  const { stdout, stderr } = await run(cwd, args)
  if (stderr.toLowerCase().includes('not a git repository')) {
    throw new NotAGitRepositoryError(dir, stderr)
  }
  return { deltas: sortChronological(parseGitLog(stdout)) }
}

/**
 * Merge fresh deltas over cached ones, sorted chronological and de-duplicated
 * by sha (fresh wins for equal shas). The fresh scan covers the window from
 * `windowFrom` (the oldest cached commit minus SCAN_MARGIN_MS) onward, so a
 * cached sha inside that window that the fresh scan no longer emits was
 * rewritten away (amend/rebase) and is pruned; cached entries older than the
 * window are kept untouched.
 */
function mergeBySha(cached: CommitDelta[], fresh: CommitDelta[], windowFrom: string): CommitDelta[] {
  const windowStart = Date.parse(windowFrom)
  const freshShas = new Set(fresh.map(d => d.sha))
  const bySha = new Map<string, CommitDelta>()
  for (const delta of cached) {
    // In-window cached shas absent from the fresh scan are stale rewritten
    // history; drop them so amended commits are not double-counted.
    if (!freshShas.has(delta.sha) && Date.parse(delta.timestamp) > windowStart) continue
    bySha.set(delta.sha, delta)
  }
  for (const delta of fresh) bySha.set(delta.sha, delta)
  return sortChronological([...bySha.values()])
}

/** Real git invocation via child_process. */
async function defaultRun(cwd: string, args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('git', [...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { stdout, stderr }
}
