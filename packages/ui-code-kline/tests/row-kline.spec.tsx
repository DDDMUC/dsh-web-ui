// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WorkspaceRowKline } from '../src/client/WorkspaceRowKline.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)
const wid = (id: string) => id as WorkspaceId

/** Render the row component against a live store instance. */
function renderRow(
  state: { entries: Record<string, unknown>; expanded: string[] },
  ensure = vi.fn(),
  toggleBranch = vi.fn(),
) {
  const seeded = {
    getSnapshot: () => state,
    subscribe: () => () => {},
  }
  const useStore = ((selector: (s: { entries: Record<string, unknown>; expanded: string[] }) => unknown) =>
    selector(seeded.getSnapshot())) as never
  return render(
    <WorkspaceRowKline
      workspaceId={wid('ws-1')}
      useStore={useStore}
      actions={{ toggleBranch } as never}
      ensure={ensure}
      useSessions={(() => undefined) as never}
      useWorkspaces={(() => undefined) as never}
      t={t}
    />,
  )
}

const candles = [
  { date: '2026-08-06', open: 0, close: 38, high: 38, low: 0, addLines: 65, delLines: 27, commits: 2 },
  { date: '2026-08-07', open: 38, close: 68, high: 68, low: 38, addLines: 30, delLines: 0, commits: 1 },
]

describe('WorkspaceRowKline', () => {
  it('requests the K-line on first render and shows a loading placeholder', () => {
    const ensure = vi.fn()
    const view = renderRow({ entries: {}, expanded: [] }, ensure)
    expect(ensure).toHaveBeenCalledWith(wid('ws-1'))
    expect(view.container.querySelector('[aria-label="加载中"]')).not.toBeNull()
  })

  it('keeps the placeholder while loading and does not refetch', () => {
    const ensure = vi.fn()
    const view = renderRow({
      entries: { 'ws-1': { workspaceId: 'ws-1', candles: [], state: 'loading', error: null } },
      expanded: [],
    }, ensure)
    expect(ensure).not.toHaveBeenCalled()
    expect(view.container.querySelector('[aria-label="加载中"]')).not.toBeNull()
  })

  it('renders the mini candlestick chart when ready', () => {
    const view = renderRow({
      entries: {
        'ws-1': {
          workspaceId: 'ws-1', candles, state: 'ready', error: null,
        },
      },
      expanded: [],
    })
    const svg = view.container.querySelector('[data-testid="code-kline-chart"]')
    expect(svg).not.toBeNull()
    expect(view.container.querySelectorAll('[data-testid="code-kline-candle"]')).toHaveLength(2)
    // Volume sub-chart is off for the mini row.
    expect(view.container.querySelectorAll('[data-testid="code-kline-volume"]')).toHaveLength(0)
  })

  it('shows the no-market placeholder for a ready-but-empty workspace', () => {
    const view = renderRow({
      entries: {
        'ws-1': {
          workspaceId: 'ws-1', candles: [], reason: 'not-a-git-repository', state: 'ready', error: null,
        },
      },
      expanded: [],
    })
    expect(view.container.querySelector('[aria-label="停牌"]')).not.toBeNull()
  })

  it('shows the scan-error mark for an error entry and refetches it', () => {
    const ensure = vi.fn()
    const view = renderRow({
      entries: {
        'ws-1': {
          workspaceId: 'ws-1', candles: [], reason: 'scan-error', state: 'error', error: null,
        },
      },
      expanded: [],
    }, ensure)
    expect(ensure).toHaveBeenCalledWith(wid('ws-1'))
    expect(view.container.querySelector('[aria-label="行情获取失败"]')).not.toBeNull()
  })

  it('toggles the quote branch on click', () => {
    const toggleBranch = vi.fn()
    const view = renderRow({
      entries: {
        'ws-1': {
          workspaceId: 'ws-1', candles, state: 'ready', error: null,
        },
      },
      expanded: [],
    }, vi.fn(), toggleBranch)
    const sparkline = view.container.querySelector('button[aria-label]') as HTMLButtonElement
    sparkline.click()
    expect(toggleBranch).toHaveBeenCalledWith(wid('ws-1'))
  })
})
