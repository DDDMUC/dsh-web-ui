/**
 * Pure chart math for the code-workload candlestick chart: value scaling,
 * moving averages, and candle geometry. No DOM, no React — unit-testable.
 */
import type { DailyKline } from '@deepseek-ai/dsh-code-kline'

/** One drawn candle's geometry in SVG coordinates (x = left edge, y = top). */
export interface CandleGeometry {
  /** Candle slot index (0-based, chart order = array order). */
  index: number
  /** Left edge x of the candle slot. */
  x: number
  /** Candle body width in px. */
  bodyWidth: number
  /** Top of the high wick. */
  yHigh: number
  /** Top of the body (max of open/close). */
  yBodyTop: number
  /** Bottom of the body (min of open/close). */
  yBodyBottom: number
  /** Bottom of the low wick. */
  yLow: number
  /** True when the candle is bullish (close >= open), else bearish. */
  up: boolean
}

/** Horizontal range of the price axis (extended to make room for wicks). */
export interface PriceRange {
  min: number
  max: number
}

/**
 * Compute the price range covering every candle plus optional moving-average
 * values, padded by 4% headroom top and bottom.
 * @param candles - daily candles (any order of dates; values only).
 * @param series - additional value series (e.g. MA points) to include.
 * @returns padded min/max; [0, 1] fallback for empty input.
 */
export function priceRange(candles: readonly DailyKline[], series: readonly (readonly (number | undefined)[])[] = []): PriceRange {
  let min = Infinity
  let max = -Infinity
  for (const c of candles) {
    if (c.low < min) min = c.low
    if (c.high > max) max = c.high
  }
  for (const s of series) {
    for (const v of s) {
      if (v === undefined) continue
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 }
  if (min === max) {
    // Flat series: fake a range around the value.
    const pad = Math.max(1, Math.abs(min) * 0.05)
    return { min: min - pad, max: max + pad }
  }
  const pad = (max - min) * 0.04
  return { min: min - pad, max: max + pad }
}

/** Map a value into SVG y (top = 0, bottom = height). */
export function scaleY(value: number, range: PriceRange, height: number): number {
  return height - ((value - range.min) / (range.max - range.min)) * height
}

/**
 * Lay out candle geometry for a fixed-width chart.
 * @param candles - daily candles in chart order.
 * @param width - chart width in px.
 * @param height - chart height in px.
 * @param range - price range (see {@link priceRange}).
 * @param slotPadding - fraction of each slot left empty on both sides.
 * @returns per-candle geometry in the same order.
 */
export function layoutCandles(
  candles: readonly DailyKline[],
  width: number,
  height: number,
  range: PriceRange,
  slotPadding = 0.28,
): CandleGeometry[] {
  const n = candles.length
  if (n === 0) return []
  const slot = width / n
  const bodyWidth = Math.max(1, slot * (1 - 2 * slotPadding))
  return candles.map((c, index) => {
    const x = index * slot + (slot - bodyWidth) / 2
    const yHigh = scaleY(c.high, range, height)
    const yLow = scaleY(c.low, range, height)
    const yOpen = scaleY(c.open, range, height)
    const yClose = scaleY(c.close, range, height)
    const yBodyTop = Math.min(yOpen, yClose)
    const yBodyBottom = Math.max(yOpen, yClose)
    // One-px minimum body so zero-move days stay visible.
    const body = Math.max(1, yBodyBottom - yBodyTop)
    return {
      index,
      x,
      bodyWidth,
      yHigh,
      yBodyTop,
      yBodyBottom: yBodyTop + body,
      yLow,
      up: c.close >= c.open,
    }
  })
}

/** Simple moving average over a close series; undefined while insufficient data. */
export function movingAverage(closes: readonly number[], period: number): (number | undefined)[] {
  if (period <= 0) return closes.map(() => undefined)
  const result: (number | undefined)[] = []
  let sum = 0
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i] as number
    if (i >= period) sum -= closes[i - period] as number
    result.push(i >= period - 1 ? sum / period : undefined)
  }
  return result
}

/** Per-day volume heights normalized against the day with the most activity. */
export function volumeHeights(candles: readonly DailyKline[], height: number): number[] {
  const maxVolume = Math.max(0, ...candles.map(c => c.addLines + c.delLines))
  if (maxVolume === 0) return candles.map(() => 0)
  return candles.map(c => ((c.addLines + c.delLines) / maxVolume) * height)
}
