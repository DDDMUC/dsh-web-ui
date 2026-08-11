/**
 * Code-K-line host service: per-workspace daily OHLC candles over git
 * history, served through `ctx.codeKline`. The API gateway's `codeKline.*`
 * RPC domain calls into this service; UI plugins consume the gateway.
 */
import { Context, Service } from 'cordis'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { aggregateDaily } from './kline.ts'
import type { DailyKline } from './kline.ts'
import { MapScanCache, NotAGitRepositoryError, scanGitLog } from './git.ts'
import type { ScanCache } from './git.ts'

/** One workspace's K-line payload: candles plus a non-OK reason when absent. */
export interface WorkspaceKline {
  /** Workspace id this payload answers for. */
  workspaceId: string
  /** Candles in ascending date order; empty when `reason` is set. */
  candles: DailyKline[]
  /**
   * Absence reason: 'not-a-git-repository' | 'no-history' | 'scan-error'.
   * Undefined when candles are present.
   */
  reason?: 'not-a-git-repository' | 'no-history' | 'scan-error'
}

/** Request window for one query. */
export interface KlineQuery {
  /** Workspace id to scan. */
  workspaceId: string
  /** Number of trailing calendar days to return (default 90). */
  days?: number
}

/** Service configuration. */
export interface CodeKlineConfig {
  /** Default trailing window in days (default 90). */
  defaultDays: number
  /** Maximum window in days (default 730). */
  maxDays: number
}

declare module 'cordis' {
  interface Context {
    codeKline: CodeKlineService
  }
}

/** Default configuration. */
export const defaultCodeKlineConfig: CodeKlineConfig = { defaultDays: 90, maxDays: 730 }

/**
 * Cordis service exposing daily K-line statistics per workspace.
 * Wraps the pure aggregation layer with the workspace registry, the git scan
 * cache, and window clamping. The service is lazy: nothing is scanned until
 * a query arrives.
 */
export class CodeKlineService extends Service {
  static inject = ['workspace']

  /** git-scan cache shared across queries. */
  readonly cache: ScanCache

  constructor(
    ctx: Context,
    config: Partial<CodeKlineConfig> = {},
    cache?: ScanCache,
  ) {
    super(ctx, 'codeKline')
    this.config = { ...defaultCodeKlineConfig, ...config }
    this.cache = cache ?? new MapScanCache()
  }

  /** Resolved configuration (defaults merged). */
  private readonly config: CodeKlineConfig

  /**
   * Resolve the trailing-window start date for `days` back from today.
   * @param days - trailing window length (clamped to [1, maxDays]).
   * @returns YYYY-MM-DD of the window start.
   */
  private windowStart(days: number): string {
    const clamped = Math.min(Math.max(1, Math.floor(days)), this.config.maxDays)
    const start = new Date()
    start.setDate(start.getDate() - clamped)
    return start.toISOString().slice(0, 10)
  }

  /**
   * Query one workspace's daily candles.
   * @param query - workspace id plus optional window.
   * @returns candles for the trailing window, or the absence reason.
   */
  async list(query: KlineQuery): Promise<WorkspaceKline> {
    const workspace = this.ctx.workspace.get(WorkspaceId(query.workspaceId))
    if (workspace === undefined) {
      return { workspaceId: query.workspaceId, candles: [], reason: 'scan-error' }
    }
    const days = query.days ?? this.config.defaultDays
    const since = this.windowStart(days)
    try {
      const deltas = await scanGitLog(workspace.path, since, this.cache)
      if (deltas.length === 0) {
        return { workspaceId: query.workspaceId, candles: [], reason: 'no-history' }
      }
      return { workspaceId: query.workspaceId, candles: aggregateDaily(deltas, since) }
    } catch (error) {
      if (error instanceof NotAGitRepositoryError) {
        return { workspaceId: query.workspaceId, candles: [], reason: 'not-a-git-repository' }
      }
      this.ctx.logger.warn(`code-kline scan failed for ${workspace.path}: ${String(error)}`)
      return { workspaceId: query.workspaceId, candles: [], reason: 'scan-error' }
    }
  }
}
