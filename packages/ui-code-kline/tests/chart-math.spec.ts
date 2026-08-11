import { describe, expect, it } from 'vitest'
import type { DailyKline } from '@deepseek-ai/dsh-code-kline'
import { layoutCandles, movingAverage, priceRange, scaleY, volumeHeights } from '../src/client/chart-math.ts'

const CANDLES: DailyKline[] = [
  { date: '2026-08-06', open: 0, close: 38, high: 38, low: 0, addLines: 65, delLines: 27, commits: 2 },
  { date: '2026-08-07', open: 38, close: 68, high: 68, low: 38, addLines: 30, delLines: 0, commits: 1 },
  { date: '2026-08-08', open: 68, close: 161, high: 161, low: 61, addLines: 113, delLines: 20, commits: 3 },
]

describe('priceRange', () => {
  it('pads min/max with 4% headroom', () => {
    const range = priceRange(CANDLES)
    expect(range.min).toBeCloseTo(0 - (161 - 0) * 0.04)
    expect(range.max).toBeCloseTo(161 + (161 - 0) * 0.04)
  })

  it('includes MA series values', () => {
    const range = priceRange(CANDLES, [movingAverage(CANDLES.map(c => c.close), 5)])
    expect(range.max).toBeGreaterThan(161) // padded beyond the candles alone
  })

  it('falls back to [0,1] for empty input', () => {
    expect(priceRange([])).toEqual({ min: 0, max: 1 })
  })

  it('fakes a range around a flat series', () => {
    const flat: DailyKline[] = [{ date: '2026-08-06', open: 10, close: 10, high: 10, low: 10, addLines: 1, delLines: 0, commits: 1 }]
    const range = priceRange(flat)
    expect(range.min).toBeLessThan(10)
    expect(range.max).toBeGreaterThan(10)
  })
})

describe('scaleY', () => {
  it('maps range min to bottom and max to top', () => {
    const range = { min: 0, max: 100 }
    expect(scaleY(0, range, 200)).toBe(200)
    expect(scaleY(100, range, 200)).toBe(0)
    expect(scaleY(50, range, 200)).toBe(100)
  })
})

describe('layoutCandles', () => {
  it('lays out one slot per candle with padded body width', () => {
    const geometry = layoutCandles(CANDLES, 300, 100, { min: 0, max: 200 })
    expect(geometry).toHaveLength(3)
    expect(geometry[0]!.x).toBeCloseTo(300 / 3 * 0.28)
    expect(geometry[0]!.bodyWidth).toBeCloseTo(300 / 3 * (1 - 2 * 0.28))
    expect(geometry[1]!.x).toBeGreaterThan(geometry[0]!.x)
  })

  it('marks up candles by close >= open and orders y correctly', () => {
    const geometry = layoutCandles(CANDLES, 300, 100, { min: 0, max: 200 })
    expect(geometry[0]!.up).toBe(true)
    expect(geometry[0]!.yBodyTop).toBeLessThan(geometry[0]!.yBodyBottom)
    expect(geometry[0]!.yHigh).toBeLessThan(geometry[0]!.yLow)
  })

  it('returns empty geometry for no candles', () => {
    expect(layoutCandles([], 300, 100, { min: 0, max: 1 })).toEqual([])
  })
})

describe('movingAverage', () => {
  it('emits undefined until the window fills', () => {
    const ma = movingAverage([1, 2, 3, 4], 3)
    expect(ma[0]).toBeUndefined()
    expect(ma[1]).toBeUndefined()
    expect(ma[2]).toBe(2)
    expect(ma[3]).toBe(3)
  })

  it('period 1 is the identity', () => {
    expect(movingAverage([1, 2, 3], 1)).toEqual([1, 2, 3])
  })
})

describe('volumeHeights', () => {
  it('normalizes against the busiest day', () => {
    const heights = volumeHeights(CANDLES, 30)
    // Day 3 volume 133 is the max -> full height; day 2 volume 30 -> 30/133.
    expect(heights[2]).toBe(30)
    expect(heights[1]).toBeCloseTo((30 / 133) * 30)
    expect(heights[0]).toBeCloseTo((92 / 133) * 30)
  })

  it('all-zero days produce zero heights', () => {
    const zero: DailyKline[] = [{ date: '2026-08-06', open: 0, close: 0, high: 0, low: 0, addLines: 0, delLines: 0, commits: 0 }]
    expect(volumeHeights(zero, 30)).toEqual([0])
  })
})
