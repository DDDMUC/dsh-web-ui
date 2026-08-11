/**
 * Candlestick chart for the code-workload K-line: renders daily candles with
 * the Chinese market idiom (red = up / net gain, green = down / net loss),
 * optional moving-average overlays, and an optional volume sub-chart (added
 * plus deleted lines per day). Pure SVG — no canvas, no chart library.
 *
 * Colors come from CSS custom properties on the host element so skins can
 * restyle: `--dsh-kline-up` / `--dsh-kline-down` / `--dsh-kline-ma` /
 * `--dsh-kline-volume`. Defaults follow the ths skin palette.
 */
import type { DailyKline } from '@deepseek-ai/dsh-code-kline'
import { layoutCandles, movingAverage, priceRange, scaleY, volumeHeights } from './chart-math.ts'
import css from './candles.module.css'

/** Chart options. */
export interface CandlestickChartOptions {
  /** Chart width in px. */
  width: number
  /** Chart height in px. */
  height: number
  /** Render the volume sub-chart (default true). */
  showVolume?: boolean
  /** Moving-average periods to overlay (default [5, 20]). */
  maPeriods?: readonly number[]
  /** Fraction of each candle slot left empty (default 0.28). */
  slotPadding?: number
}

const cls = (name: keyof typeof css): string => css[name] ?? ''

/** Daily net change of one candle, for labels and legend. */
export function candleNetChange(candle: DailyKline): number {
  return candle.close - candle.open
}

/**
 * Render a candlestick chart of daily code-workload candles.
 * @param props - candles plus options.
 * @returns an SVG element sized to the options.
 */
export function CandlestickChart(props: { candles: readonly DailyKline[] } & CandlestickChartOptions) {
  const { candles, width, height, showVolume = true, maPeriods = [5, 20], slotPadding } = props
  const priceHeight = showVolume ? Math.round(height * 0.72) : height
  const volumeHeight = height - priceHeight

  const closes = candles.map(c => c.close)
  const maSeries = maPeriods.map(period => movingAverage(closes, period))
  const range = priceRange(candles, maSeries)
  const geometry = layoutCandles(candles, width, priceHeight, range, slotPadding)
  const volumes = volumeHeights(candles, volumeHeight)

  // Volume bars bottom-aligned under the price area.

  return (
    <svg
      className={cls('chart')}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="代码工作量日K线图"
      data-testid="code-kline-chart"
    >
      {geometry.map(g => (
        <g key={g.index} data-testid="code-kline-candle">
          {/* wick */}
          <line
            className={g.up ? cls('wickUp') : cls('wickDown')}
            x1={g.x + g.bodyWidth / 2}
            x2={g.x + g.bodyWidth / 2}
            y1={g.yHigh}
            y2={g.yLow}
            strokeWidth={1}
          />
          {/* body */}
          <rect
            className={g.up ? cls('bodyUp') : cls('bodyDown')}
            x={g.x}
            y={g.yBodyTop}
            width={g.bodyWidth}
            height={g.yBodyBottom - g.yBodyTop}
          />
        </g>
      ))}
      {maSeries.map((series, seriesIndex) => (
        <polyline
          key={seriesIndex}
          className={cls('ma')}
          data-ma-period={maPeriods[seriesIndex]}
          fill="none"
          strokeWidth={1}
          points={series
            .map((value, index) => {
              const g = geometry[index]
              return value === undefined || g === undefined
                ? null
                : `${g.x + g.bodyWidth / 2},${scaleY(value, range, priceHeight)}`
            })
            .filter((point): point is string => point !== null)
            .join(' ')}
        />
      ))}
      {showVolume &&
        candles.map((c, index) => {
          const g = geometry[index]
          const volume = volumes[index] ?? 0
          return (
            <rect
              key={`v${index}`}
              className={c.close >= c.open ? cls('volumeUp') : cls('volumeDown')}
              x={g?.x ?? 0}
              y={priceHeight + volumeHeight - volume}
              width={g?.bodyWidth ?? 0}
              height={Math.max(0, volume)}
              data-testid="code-kline-volume"
            />
          )
        })}
    </svg>
  )
}
