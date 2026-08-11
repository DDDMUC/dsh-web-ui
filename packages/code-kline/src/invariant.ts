/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-code-kline`.
 * @module @deepseek-ai/dsh-code-kline/invariant
 */

/* jscpd:ignore-start */
import type { Context } from 'cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { DailyKline } from './kline.ts'

const PACKAGE_NAME = '@deepseek-ai/dsh-code-kline'

/** Cordis companion plugin name. */
export const name = 'code-kline-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * Validate one daily candle's shape. Exported so the service layer and tests
 * can reuse the same checks; the companion installs the empty form because
 * the package owns no cordis events or cross-plugin mutable state.
 */
export function validateKlineCandle(candle: unknown, fail: (message: string) => void): void {
  const record = candle as Record<string, unknown> | null
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    fail('code-kline daily candle must be an object')
    return
  }
  if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
    fail(`code-kline candle date must be YYYY-MM-DD, got ${JSON.stringify(record.date)}`)
  }
  for (const key of ['open', 'close', 'high', 'low', 'addLines', 'delLines', 'commits'] as const) {
    const value = record[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(`code-kline candle ${key} must be a finite number`)
    }
  }
  const open = record.open as number
  const close = record.close as number
  const high = record.high as number
  const low = record.low as number
  const lo = Math.min(open, close)
  const hi = Math.max(open, close)
  if (high < hi) fail(`code-kline candle high ${high} below body top ${hi}`)
  if (low > lo) fail(`code-kline candle low ${low} above body bottom ${lo}`)
}

/** Validate a whole candle list, failing per candle. */
export function validateKlineCandles(candles: readonly DailyKline[], fail: (message: string) => void): void {
  for (const candle of candles) validateKlineCandle(candle, fail)
}

/**
 * No runtime invariant: the package owns no cordis events and no
 * cross-plugin mutable state — its contract is per-query git scans and pure
 * aggregation, asserted by unit tests and the API gateway's schema layer.
 */
const install: InvariantInstaller = () => {}
/* jscpd:ignore-end */

/**
 * Register the code-kline invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
