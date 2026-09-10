import { describe, expect, it } from 'vitest'
import { deepseekVoucherData, formatDenomination, voucherSerial } from '../src/client/voucher.ts'
import { emptyTotals, type UsageProviderSummary, type UsageWindowSummary } from '../src/core/types.ts'

/**
 * The voucher's pure face: DeepSeek official family summation over a usage
 * window, the banknote denomination formatting, and the deterministic
 * serial. The canvas draw itself is composition, verified visually.
 */

function row(provider: string, inputTokens: number, calls = 1, cost = 0): UsageProviderSummary {
  return { provider, totals: { ...emptyTotals(), inputTokens, calls, cost }, models: [] }
}

function windowOf(providers: UsageProviderSummary[]): UsageWindowSummary {
  return { from: '2025-12-01', to: '2026-01-01', totals: emptyTotals(), providers }
}

describe('deepseekVoucherData', () => {
  it('returns undefined without a window (older host) or without family usage', () => {
    expect(deepseekVoucherData(undefined)).toBeUndefined()
    expect(deepseekVoucherData(windowOf([row('kimi-coding', 100)]))).toBeUndefined()
    expect(deepseekVoucherData(windowOf([]))).toBeUndefined()
  })

  it('sums the whole official family across route aliases and ignores other providers', () => {
    const data = deepseekVoucherData(windowOf([
      row('deepseek', 100_000, 3, 1.25),
      row('deepseek-official', 50_000, 2, 0.75),
      row('kimi-coding', 999_999, 40, 0),
    ]))
    expect(data).toMatchObject({ tokens: 150_000, calls: 5, cost: 2, from: '2025-12-01', to: '2026-01-01' })
  })

  it('counts cache tokens as minted whale yuan', () => {
    const data = deepseekVoucherData(windowOf([{
      provider: 'deepseek',
      totals: { ...emptyTotals(), inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40, calls: 1 },
      models: [],
    }]))
    expect(data?.tokens).toBe(100)
  })
})

describe('formatDenomination', () => {
  it('prints full digits with thousands separators', () => {
    expect(formatDenomination(0)).toBe('0')
    expect(formatDenomination(999)).toBe('999')
    expect(formatDenomination(1234)).toBe('1,234')
    expect(formatDenomination(1_234_567)).toBe('1,234,567')
    expect(formatDenomination(1_234_567_890)).toBe('1,234,567,890')
  })

  it('rounds fractional accumulations away', () => {
    expect(formatDenomination(1234.6)).toBe('1,235')
  })
})

describe('voucherSerial', () => {
  it('derives a deterministic zero-padded serial from the minted total', () => {
    expect(voucherSerial(42)).toBe('000000042')
    expect(voucherSerial(123_456_789)).toBe('123456789')
    expect(voucherSerial(1_000_000_000)).toBe('000000000')
    expect(voucherSerial(1_000_000_042)).toBe('000000042')
  })
})
