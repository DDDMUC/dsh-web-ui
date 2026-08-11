/**
 * Wire projection of the daily code-workload K-line candle, localized from
 * the dsh host apiproxy's code-kline domain contract. The source checkout's
 * apiproxy used to export it; after the plugin consolidation
 * (@deepseek-ai/dsh-code-kline moved to the dsh-web-ui monorepo) the client
 * keeps the structural twin here — same posture as every other wire payload.
 */

/** One daily candle: net line value OHLC plus per-day volume and commit count. */
export interface KlineCandleView {
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
