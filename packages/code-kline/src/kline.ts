/**
 * Daily code-workload K-line aggregation: turn `git log --numstat` output
 * into per-day OHLC candles over the cumulative net line delta of a
 * workspace.
 *
 * Semantics (the "净值" reading, matching the ths skin's 红涨绿跌 idiom):
 * - net value at a commit = cumulative added lines minus deleted lines since
 *   the aggregation start (statistics inception).
 * - open  = net value right after the previous day's last commit (previous
 *   close), so a candle's body is exactly the day's net change.
 * - close = net value after the day's last commit.
 * - high / low = min/max net value observed at commit granularity during the
 *   day (intraday trajectory rebuilt from commit deltas).
 * - A red candle means the day ended with a net gain, green a net loss.
 * - Volume (addLines/delLines/commits) is carried per day for the volume
 *   sub-chart.
 *
 * Purely functional: the git invocation and any caching live outside this
 * module so it can be unit-tested with fixture output.
 */

/** One parsed `git log --numstat` commit. */
export interface CommitDelta {
  /** Commit sha (identity for incremental merge de-duplication). */
  sha: string
  /** Author date in YYYY-MM-DDTHH:mm:ss local form as emitted by --date=iso. */
  timestamp: string
  /** Committed-line counts: added, deleted. */
  added: number
  deleted: number
}

/** One daily candle. All line counts are integers; net = added - deleted. */
export interface DailyKline {
  /** Local calendar day, YYYY-MM-DD. */
  date: string
  /** Net value after the previous day's last commit (previous close). */
  open: number
  /** Net value after this day's last commit. */
  close: number
  /** Highest net value observed at commit granularity this day. */
  high: number
  /** Lowest net value observed at commit granularity this day. */
  low: number
  /** Lines added this day (volume sub-chart). */
  addLines: number
  /** Lines deleted this day (volume sub-chart). */
  delLines: number
  /** Commit count this day. */
  commits: number
}

/**
 * Parse the stdout of `git log --numstat --date=iso --pretty=...` into one
 * delta per COMMIT (all of a commit's file changes are one atomic update to
 * the net value — intraday trajectory is commit-granular). Expected
 * per-commit record (see {@link GIT_LOG_ARGS}):
 *
 * ```
 * commit <sha>
 * Date:   2026-08-08T14:30:00+08:00
 *
 * 12      3       src/a.ts
 * 0       5       src/b.ts
 * ```
 *
 * Binary entries (`-`) and blank lines are skipped. A commit without a
 * `Date:` header is dropped (it cannot be placed on a calendar day).
 * @param output - raw git log stdout.
 * @returns one commit delta per parsed commit, in output order (chronological
 * when the caller passes `--reverse`, else sort with {@link sortChronological}).
 */
export function parseGitLog(output: string): CommitDelta[] {
  const deltas: CommitDelta[] = []
  let current: CommitDelta | null = null
  for (const line of output.split('\n')) {
    if (line.startsWith('commit ')) {
      if (current !== null) deltas.push(current)
      current = { sha: line.slice('commit '.length).trim(), timestamp: '', added: 0, deleted: 0 }
    } else if (line.startsWith('Date:')) {
      const timestamp = line.slice('Date:'.length).trim()
      if (current !== null) current.timestamp = timestamp
    } else if (current !== null && /^\d+\s+\d+\s+\S/.test(line)) {
      const [addedRaw, deletedRaw] = line.split(/\s+/, 2)
      const added = Number.parseInt(addedRaw ?? '0', 10)
      const deleted = Number.parseInt(deletedRaw ?? '0', 10)
      if (Number.isFinite(added) && Number.isFinite(deleted)) {
        current.added += added
        current.deleted += deleted
      }
    }
  }
  if (current !== null) deltas.push(current)
  // Commits without a date header cannot be placed on a calendar day.
  return deltas.filter(d => d.timestamp !== '')
}

/** Extract the local calendar date (YYYY-MM-DD) from an ISO-ish timestamp. */
export function calendarDate(timestamp: string): string {
  // --date=iso emits `2026-08-08T14:30:00+08:00`; slice the T-prefix.
  const tIndex = timestamp.indexOf('T')
  return tIndex === -1 ? timestamp.slice(0, 10) : timestamp.slice(0, tIndex)
}

/** Sort deltas chronologically by timestamp (stable for equal stamps). */
export function sortChronological(deltas: CommitDelta[]): CommitDelta[] {
  return [...deltas].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0))
}

/**
 * Aggregate chronologically-sorted commit deltas into daily candles.
 * @param deltas - commit deltas, any order (sorted internally).
 * @param startDate - optional aggregation start (YYYY-MM-DD); commits before
 * it are ignored. The first candle's open is the net value just before that
 * day, i.e. 0 unless commits on earlier dates are supplied.
 * @returns candles in ascending date order. Dates with no commits are not
 * emitted (callers may fill gaps for charting).
 */
export function aggregateDaily(deltas: CommitDelta[], startDate?: string): DailyKline[] {
  const sorted = sortChronological(deltas)
  const candles = new Map<string, DailyKline>()
  let net = 0
  let prevClose = 0
  let dayStarted = false
  for (const delta of sorted) {
    const date = calendarDate(delta.timestamp)
    if (startDate !== undefined && date < startDate) continue
    net += delta.added - delta.deleted
    let candle = candles.get(date)
    if (!candle) {
      const open = dayStarted ? prevClose : 0
      candle = {
        date,
        open,
        close: net,
        high: Math.max(open, net),
        low: Math.min(open, net),
        addLines: 0,
        delLines: 0,
        commits: 0,
      }
      candles.set(date, candle)
      dayStarted = true
    }
    candle.close = net
    if (net > candle.high) candle.high = net
    if (net < candle.low) candle.low = net
    candle.addLines += delta.added
    candle.delLines += delta.deleted
    candle.commits += 1
    prevClose = net
  }
  return [...candles.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** The default `git log` argument vector this package drives. */
export const GIT_LOG_ARGS = [
  'log',
  '--numstat',
  '--date=iso',
  '--pretty=format:commit %H%nDate: %ad',
] as const

/**
 * Build a git-log command line for one workspace directory.
 * @param cwd - the workspace directory (must be a git repository).
 * @param since - optional `--since` value (e.g. '90 days ago').
 */
export function gitLogCommand(cwd: string, since?: string): { cwd: string; args: readonly string[] } {
  const args: string[] = [...GIT_LOG_ARGS]
  if (since !== undefined) args.push('--since', since)
  return { cwd, args }
}
