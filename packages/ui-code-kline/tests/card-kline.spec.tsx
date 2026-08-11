// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { WorkspaceKlineCard } from '../src/client/WorkspaceKlineCard.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)
const wid = (id: string) => id as WorkspaceId

/** Render the card against a state stub. */
function renderCard(state: { entries: Record<string, unknown>; expanded: string[] }, ensure = vi.fn(), toggleBranch = vi.fn()) {
  const seeded = {
    getSnapshot: () => state,
    subscribe: () => () => {},
  }
  const useStore = ((selector: (s: { entries: Record<string, unknown>; expanded: string[] }) => unknown) =>
    selector(seeded.getSnapshot())) as never
  return render(
    <WorkspaceKlineCard
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

describe('WorkspaceKlineCard', () => {
  it('renders nothing while closed', () => {
    renderCard({ entries: {}, expanded: [] })
    expect(document.body.textContent).not.toContain('代码行情')
  })

  it('renders the full chart when open and ready', () => {
    renderCard({
      entries: { 'ws-1': { workspaceId: 'ws-1', candles, state: 'ready', error: null } },
      expanded: ['ws-1'],
    })
    expect(document.body.querySelectorAll('[data-testid="code-kline-candle"]')).toHaveLength(2)
    // The card shows the volume sub-chart.
    expect(document.body.querySelectorAll('[data-testid="code-kline-volume"]')).toHaveLength(2)
  })

  it('requests the K-line when open with no entry yet', () => {
    const ensure = vi.fn()
    renderCard({ entries: {}, expanded: ['ws-1'] }, ensure)
    expect(ensure).toHaveBeenCalledWith(wid('ws-1'))
    expect(document.body.textContent).toContain('加载中')
  })

  it('shows the absence reason when open without candles', () => {
    renderCard({
      entries: {
        'ws-1': { workspaceId: 'ws-1', candles: [], reason: 'not-a-git-repository', state: 'ready', error: null },
      },
      expanded: ['ws-1'],
    })
    expect(document.body.textContent).toContain('非 git 仓库')
  })

  it('shows the scan-error reason for an error entry and refetches it', () => {
    const ensure = vi.fn()
    renderCard({
      entries: {
        'ws-1': { workspaceId: 'ws-1', candles: [], reason: 'scan-error', state: 'error', error: null },
      },
      expanded: ['ws-1'],
    }, ensure)
    expect(ensure).toHaveBeenCalledWith(wid('ws-1'))
    expect(document.body.textContent).toContain('行情获取失败')
  })

  it('closes through the toggle action', () => {
    const toggleBranch = vi.fn()
    renderCard({
      entries: { 'ws-1': { workspaceId: 'ws-1', candles, state: 'ready', error: null } },
      expanded: ['ws-1'],
    }, vi.fn(), toggleBranch)
    // The Modal closes on mask click (portal to document.body).
    const mask = document.body.querySelector('[aria-hidden="true"]')
    mask?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(toggleBranch).toHaveBeenCalledWith(wid('ws-1'))
  })
})
