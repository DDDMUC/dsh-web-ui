import { describe, expect, it } from 'vitest'
import { aggregateDaily, calendarDate, parseGitLog, sortChronological } from '../src/kline.ts'

/** A realistic `git log --numstat --date=iso` fixture spanning three days. */
const FIXTURE = [
  'commit a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  'Date:   2026-08-06T09:00:00+08:00',
  '',
  '40      10      src/init.ts',
  '5       0       README.md',
  '',
  'commit b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
  'Date:   2026-08-06T18:00:00+08:00',
  '',
  '0       15      src/init.ts',
  '20      2       src/util.ts',
  '',
  'commit c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
  'Date:   2026-08-07T10:30:00+08:00',
  '',
  '30      0       src/feature.ts',
  '',
  'commit d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
  'Date:   2026-08-08T11:00:00+08:00',
  '',
  '5       20      src/feature.ts',
  '8       0       docs/notes.md',
  '',
  'commit e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
  'Date:   2026-08-08T16:45:00+08:00',
  '',
  '100     0       src/big.ts',
].join('\n')

describe('parseGitLog', () => {
  it('aggregates file entries into one delta per commit with its date header', () => {
    const deltas = parseGitLog(FIXTURE)
    expect(deltas).toHaveLength(5)
    // commit a1b2: 40-10 (init.ts) + 5-0 (README.md) -> one atomic update.
    expect(deltas[0]).toEqual({
      sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      timestamp: '2026-08-06T09:00:00+08:00',
      added: 45,
      deleted: 10,
    })
    expect(deltas[1]).toEqual({
      sha: 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
      timestamp: '2026-08-06T18:00:00+08:00',
      added: 20,
      deleted: 17,
    })
    expect(deltas[4]).toEqual({
      sha: 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
      timestamp: '2026-08-08T16:45:00+08:00',
      added: 100,
      deleted: 0,
    })
  })

  it('skips binary entries and dangling lines', () => {
    const output = [
      'commit abcdef0123456789abcdef0123456789abcdef01',
      'Date:   2026-08-08T10:00:00+08:00',
      '',
      '-       -       assets/logo.png',
      '3       1       src/a.ts',
    ].join('\n')
    const deltas = parseGitLog(output)
    expect(deltas).toEqual([{ sha: 'abcdef0123456789abcdef0123456789abcdef01', timestamp: '2026-08-08T10:00:00+08:00', added: 3, deleted: 1 }])
  })
})

describe('calendarDate', () => {
  it('extracts the local calendar day from ISO timestamps', () => {
    expect(calendarDate('2026-08-08T16:45:00+08:00')).toBe('2026-08-08')
    expect(calendarDate('2026-08-08')).toBe('2026-08-08')
  })
})

describe('sortChronological', () => {
  it('orders by timestamp', () => {
    const sorted = sortChronological(parseGitLog(FIXTURE))
    expect(sorted[0]!.timestamp).toBe('2026-08-06T09:00:00+08:00')
    expect(sorted.at(-1)!.timestamp).toBe('2026-08-08T16:45:00+08:00')
  })
})

describe('aggregateDaily', () => {
  it('computes OHLC as cumulative net value at commit granularity', () => {
    const candles = aggregateDaily(parseGitLog(FIXTURE))
    expect(candles).toHaveLength(3)

    // Day 1: 09:00 commit net +35 (45-10), 18:00 commit net +3 (20-17) -> 38.
    const d1 = candles[0]!
    expect(d1.date).toBe('2026-08-06')
    expect(d1.open).toBe(0) // inception day, no prior value
    expect(d1.close).toBe(38)
    expect(d1.high).toBe(38)
    expect(d1.low).toBe(0) // starts at 0 before the first commit
    expect(d1.addLines).toBe(65) // 45+20
    expect(d1.delLines).toBe(27) // 10+17
    expect(d1.commits).toBe(2)
  })

  it('chains candle opens from the previous close', () => {
    const candles = aggregateDaily(parseGitLog(FIXTURE))
    const d2 = candles[1]!
    expect(d2.date).toBe('2026-08-07')
    expect(d2.open).toBe(38) // previous close
    expect(d2.close).toBe(68) // +30
    expect(d2.high).toBe(68)
    expect(d2.low).toBe(38)
  })

  it('rebuilds intraday high/low from commit granularity', () => {
    const candles = aggregateDaily(parseGitLog(FIXTURE))
    const d3 = candles[2]!
    // 11:00 commit: 68 -7 = 61 (low), 16:45 commit: +100 -> 161 (high/close)
    expect(d3.open).toBe(68)
    expect(d3.low).toBe(61)
    expect(d3.high).toBe(161)
    expect(d3.close).toBe(161)
  })

  it('honors startDate by ignoring earlier days', () => {
    const candles = aggregateDaily(parseGitLog(FIXTURE), '2026-08-07')
    expect(candles.map(c => c.date)).toEqual(['2026-08-07', '2026-08-08'])
    expect(candles[0]!.open).toBe(0) // startDate is a fresh inception
  })

  it('returns empty for empty input', () => {
    expect(aggregateDaily([])).toEqual([])
  })
})
