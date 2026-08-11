/**
 * Code-workload K-line statistics: daily OHLC candles over a workspace's git
 * history (net line deltas, commit-granular), plus the git scan/cache layer
 * and the `ctx.codeKline` service the API gateway queries.
 * @module @deepseek-ai/dsh-code-kline
 */

import type { Context } from 'cordis'
import { CodeKlineService } from './service.ts'
import type { CodeKlineConfig } from './service.ts'

/** Services required by the host plugin. */
export const inject = ['workspace']

/** Plugin configuration (see {@link CodeKlineConfig}). */
export type Config = Partial<CodeKlineConfig>

/** Register the code-kline service on the context. */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(CodeKlineService, config)
}

export {
  aggregateDaily,
  calendarDate,
  gitLogCommand,
  GIT_LOG_ARGS,
  parseGitLog,
  sortChronological,
} from './kline.ts'
export type { CommitDelta, DailyKline } from './kline.ts'
export { MapScanCache, NotAGitRepositoryError, scanGitLog } from './git.ts'
export type { ScanCache } from './git.ts'
export { CodeKlineService } from './service.ts'
export type { CodeKlineConfig, KlineQuery, WorkspaceKline } from './service.ts'
