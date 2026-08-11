/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { DailyKline } from '@deepseek-ai/dsh-code-kline'
import { CandlestickChart, candleNetChange } from '../src/client/CandlestickChart.tsx'

afterEach(cleanup)

const CANDLES: DailyKline[] = [
  { date: '2026-08-06', open: 0, close: 38, high: 38, low: 0, addLines: 65, delLines: 27, commits: 2 },
  { date: '2026-08-07', open: 38, close: 68, high: 68, low: 38, addLines: 30, delLines: 0, commits: 1 },
  { date: '2026-08-08', open: 68, close: 161, high: 161, low: 61, addLines: 113, delLines: 20, commits: 3 },
]

describe('CandlestickChart', () => {
  it('renders one candle group per day', () => {
    const view = render(<CandlestickChart candles={CANDLES} width={300} height={150} />)
    expect(view.container.querySelectorAll('[data-testid="code-kline-candle"]')).toHaveLength(3)
    expect(view.container.querySelector('svg')).not.toBeNull()
  })

  it('renders the volume sub-chart by default and omits it when disabled', () => {
    const withVolume = render(<CandlestickChart candles={CANDLES} width={300} height={150} />)
    expect(withVolume.container.querySelectorAll('[data-testid="code-kline-volume"]')).toHaveLength(3)

    const without = render(<CandlestickChart candles={CANDLES} width={300} height={150} showVolume={false} />)
    expect(without.container.querySelectorAll('[data-testid="code-kline-volume"]')).toHaveLength(0)
  })

  it('renders MA overlays for each configured period', () => {
    const view = render(<CandlestickChart candles={CANDLES} width={300} height={150} maPeriods={[5, 20]} />)
    const overlays = view.container.querySelectorAll('polyline[data-ma-period]')
    expect(overlays).toHaveLength(2)
  })

  it('renders an empty chart for no candles', () => {
    const view = render(<CandlestickChart candles={[]} width={300} height={150} />)
    expect(view.container.querySelectorAll('[data-testid="code-kline-candle"]')).toHaveLength(0)
  })
})

describe('candleNetChange', () => {
  it('computes the daily net change', () => {
    expect(candleNetChange(CANDLES[0]!)).toBe(38)
    expect(candleNetChange(CANDLES[1]!)).toBe(30)
    expect(candleNetChange(CANDLES[2]!)).toBe(93)
  })
})
