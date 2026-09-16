/** @vitest-environment jsdom */

/**
 * Sidebar usage panel (issue #1592): the collapsed-state persistence, the
 * plan/balance rendering over the same overview document, the empty and error
 * states, and the visibility-gated polling.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { ProviderSnapshotView, UsageOverviewView } from '../src/core/types.ts'
import { emptyTotals } from '../src/core/types.ts'
import { UsageSidebarPanel } from '../src/client/UsageSidebarPanel.tsx'
import type { UsageStoreInstance, UsageUiState } from '../src/client/usage-store.ts'

afterEach(cleanup)

beforeEach(() => {
  window.localStorage.clear()
  // The panel resolves copy from the document language (no framework seat).
  document.documentElement.lang = 'en'
})

/** A plan-capable provider row. */
function planProvider(): ProviderSnapshotView {
  return {
    provider: 'zai',
    displayName: 'Z.AI',
    credential: 'api-key',
    supported: true,
    planSupported: true,
    plan: {
      planName: 'GLM-Code-Plan',
      updatedAt: 1,
      windows: [
        { key: '5h', percent: 12.5, resetsAt: '2026-09-01T02:40:00.000Z' },
        { key: 'week', percent: 91, resetsAt: '2026-09-03T02:40:00.000Z' },
      ],
    },
  }
}

/** A balance-only provider row. */
function balanceProvider(): ProviderSnapshotView {
  return {
    provider: 'deepseek',
    displayName: 'DeepSeek',
    credential: 'api-key',
    supported: true,
    balanceSupported: true,
    balance: { currency: 'CNY', totalBalance: '110.00', updatedAt: 1 },
  }
}

/** An overview with the given provider rows and no ledger usage. */
function overview(providers: ProviderSnapshotView[]): UsageOverviewView {
  return {
    updatedAt: 1_700_000_000_000,
    providers,
    current: { source: 'default' },
    usage: { today: { date: '2026-01-01', totals: emptyTotals(), providers: [] }, days: [] },
  }
}

function store(state: UsageUiState): UsageStoreInstance {
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UsageStoreInstance
}

const ready = (snapshot: UsageOverviewView): UsageUiState => ({ snapshot, status: 'ready', error: null })

describe('UsageSidebarPanel (issue #1592)', () => {
  it('renders plan windows and balance-only rows from the same overview document', () => {
    render(<UsageSidebarPanel store={store(ready(overview([planProvider(), balanceProvider()])))} poll={() => {}} refresh={() => {}} />)
    expect(screen.getByText('Z.AI')).toBeTruthy()
    expect(screen.getByText('5 hours')).toBeTruthy()
    expect(screen.getByText('13%')).toBeTruthy()
    expect(screen.getByText('Weekly')).toBeTruthy()
    expect(screen.getByText('91%')).toBeTruthy()
    // Balance-only rows show their remaining amount instead of a bar.
    expect(screen.getByText('CNY 110.00 left')).toBeTruthy()
  })

  it('shows the empty line when no provider carries plan or balance data', () => {
    render(<UsageSidebarPanel store={store(ready(overview([])))} poll={() => {}} refresh={() => {}} />)
    expect(screen.getByText('No plan or balance data configured.')).toBeTruthy()
  })

  it('surfaces the transport error instead of failing the panel', () => {
    render(<UsageSidebarPanel store={store({ snapshot: null, status: 'error', error: 'boom' })} poll={() => {}} refresh={() => {}} />)
    expect(screen.getByText('Loading failed: boom')).toBeTruthy()
  })

  it('persists the collapsed state across mounts', () => {
    const view = render(<UsageSidebarPanel store={store(ready(overview([planProvider()])))} poll={() => {}} refresh={() => {}} />)
    expect(window.localStorage.getItem('dsh-usage.sidebar.collapsed')).toBeNull()
    act(() => { screen.getByRole('button', { name: 'Collapse' }).click() })
    expect(window.localStorage.getItem('dsh-usage.sidebar.collapsed')).toBe('1')
    view.unmount()
    render(<UsageSidebarPanel store={store(ready(overview([planProvider()])))} poll={() => {}} refresh={() => {}} />)
    expect(screen.queryByText('Z.AI')).toBeNull()
    act(() => { screen.getByRole('button', { name: 'Expand' }).click() })
    expect(screen.getByText('Z.AI')).toBeTruthy()
  })

  it('polls only while visible and enabled', () => {
    const poll = vi.fn()
    let visibility: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    const view = render(<UsageSidebarPanel store={store(ready(overview([planProvider()])))} poll={poll} refresh={() => {}} />)
    expect(poll).toHaveBeenCalledTimes(1)
    act(() => {
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const calls = poll.mock.calls.length
    expect(calls).toBe(1)
    act(() => {
      visibility = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(poll.mock.calls.length).toBe(calls + 1)
    view.unmount()
  })
})
