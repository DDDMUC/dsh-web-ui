/** @vitest-environment jsdom */

/**
 * Sidebar usage panel (issue #1592): the content body under the entry row.
 * The open state arrives through the mount's face; expanded renders the
 * quota/balance body, collapsed renders the current provider's today strip,
 * and polling pauses only while the page is hidden.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import type { ProviderSnapshotView, UsageOverviewView } from '../src/core/types.ts'
import { emptyTotals } from '../src/core/types.ts'
import { UsageSidebarPanel, type OpenStateSource } from '../src/client/UsageSidebarPanel.tsx'
import type { UsageStoreInstance, UsageUiState } from '../src/client/usage-store.ts'

afterEach(() => {
  cleanup()
  delete (document as { visibilityState?: string }).visibilityState
})

beforeEach(() => {
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

/** Mutable open-state face mirroring the mount's subscribe/isOpen contract. */
interface TestOpenState extends OpenStateSource { set(next: boolean): void }

function openState(initial: boolean): TestOpenState {
  const listeners = new Set<() => void>()
  let open = initial
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    isOpen: () => open,
    set(next: boolean) {
      open = next
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('UsageSidebarPanel (issue #1592)', () => {
  it('user sees plan windows and balance rows from the same overview document', () => {
    // Given an expanded panel whose overview carries a plan provider and a balance-only provider
    const view = render(<UsageSidebarPanel store={store(ready(overview([planProvider(), balanceProvider()])))} poll={() => {}} open={openState(true)} />)

    // When the body renders
    // Then the plan windows list with their percents and the balance row shows the remaining amount
    expect(view.container.textContent).toContain('Z.AI')
    expect(view.container.textContent).toContain('5 hours')
    expect(view.container.textContent).toContain('13%')
    expect(view.container.textContent).toContain('Weekly')
    expect(view.container.textContent).toContain('91%')
    expect(view.container.textContent).toContain('CNY 110.00 left')
  })

  it('user sees the empty line when no provider carries plan or balance data', () => {
    // Given an expanded panel whose overview lists no providers
    const view = render(<UsageSidebarPanel store={store(ready(overview([])))} poll={() => {}} open={openState(true)} />)

    // When the body renders
    // Then the empty copy explains the missing configuration
    expect(view.container.textContent).toContain('No plan or balance data configured.')
  })

  it('user sees the transport error instead of a failed panel', () => {
    // Given an expanded panel whose store carries a transport error
    const view = render(<UsageSidebarPanel store={store({ snapshot: null, status: 'error', error: 'boom' })} poll={() => {}} open={openState(true)} />)

    // When the body renders
    // Then the transport message surfaces inline
    expect(view.container.textContent).toContain('Loading failed: boom')
  })

  it('user collapsing the panel empties the body and expanding restores it', () => {
    // Given an expanded panel listing a provider
    const state = openState(true)
    const view = render(<UsageSidebarPanel store={store(ready(overview([planProvider()])))} poll={() => {}} open={state} />)
    expect(view.container.textContent).toContain('Z.AI')

    // When the open state flips to collapsed
    act(() => { state.set(false) })

    // Then the body unmounts its content
    expect(view.container.textContent).toBe('')

    // When the open state flips back to expanded
    act(() => { state.set(true) })

    // Then the content returns
    expect(view.container.textContent).toContain('Z.AI')
  })

  it('user polling pauses only while the page is hidden', () => {
    // Given an expanded panel with a counting poll and a controllable visibility state
    const poll = vi.fn()
    const state = openState(true)
    let visibility: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    const view = render(<UsageSidebarPanel store={store(ready(overview([planProvider()])))} poll={poll} open={state} />)
    expect(view.container.textContent).toContain('Z.AI')
    const expandedCalls = poll.mock.calls.length

    // When the page hides
    act(() => {
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Then no further poll fires
    expect(poll.mock.calls.length).toBe(expandedCalls)

    // When the page becomes visible again
    act(() => {
      visibility = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Then polling resumes with one fresh fetch
    expect(poll.mock.calls.length).toBe(expandedCalls + 1)

    // When the panel collapses
    act(() => { state.set(false) })

    // Then the strip refreshes once immediately
    expect(poll.mock.calls.length).toBe(expandedCalls + 2)

    // When the page visibility cycles while collapsed
    act(() => {
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      visibility = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Then the collapsed strip still fetches on the visible return
    expect(poll.mock.calls.length).toBe(expandedCalls + 3)
    view.unmount()
  })

  it('user sees the current provider today usage on the collapsed strip', () => {
    // Given a collapsed panel whose overview carries the strip-ready current view
    const document_ = overview([balanceProvider()])
    document_.current = {
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      source: 'live',
      displayName: 'DeepSeek',
      today: { ...emptyTotals(), inputTokens: 1_200_000, outputTokens: 300_000, calls: 42, cost: 1.23 },
    }
    const view = render(<UsageSidebarPanel store={store(ready(document_))} poll={() => {}} open={openState(false)} />)

    // When the strip renders
    // Then the provider name, today's tokens, the call count, and the priced cost show in one line
    const text = view.container.textContent ?? ''
    expect(text).toContain('DeepSeek')
    expect(text).toContain('1.5M tokens today')
    expect(text).toContain('42 calls')
    expect(text).toContain('¥1.23')
  })

  it('user without usage today sees no collapsed strip', () => {
    // Given a collapsed panel whose current provider has no usage today
    const document_ = overview([balanceProvider()])
    document_.current = { provider: 'deepseek', source: 'live', displayName: 'DeepSeek' }
    const view = render(<UsageSidebarPanel store={store(ready(document_))} poll={() => {}} open={openState(false)} />)

    // When the strip would render
    // Then nothing shows
    expect(view.container.textContent).toBe('')
  })

  it('user sees the strip derived against an older host document', () => {
    // Given a collapsed panel whose overview lacks the strip fields but lists today's usage
    const document_ = overview([balanceProvider()])
    document_.current = { provider: 'deepseek', source: 'live' }
    document_.usage.today.providers = [
      { provider: 'deepseek', totals: { ...emptyTotals(), inputTokens: 5000, calls: 3 }, models: [] },
    ]
    const view = render(<UsageSidebarPanel store={store(ready(document_))} poll={() => {}} open={openState(false)} />)

    // When the strip derives its facts from the providers list and the today rows
    // Then the name, tokens, and calls still show, and the unpriced cost stays absent
    const text = view.container.textContent ?? ''
    expect(text).toContain('DeepSeek')
    expect(text).toContain('5k tokens today')
    expect(text).toContain('3 calls')
    expect(text).not.toContain('¥')
  })

  it('user sees aliased family routes folded into the collapsed strip', () => {
    // Given a collapsed panel whose today rows split across the deepseek route aliases
    const document_ = overview([balanceProvider()])
    document_.current = { provider: 'deepseek', source: 'live' }
    document_.usage.today.providers = [
      { provider: 'deepseek', totals: { ...emptyTotals(), inputTokens: 2000, calls: 1 }, models: [] },
      { provider: 'deepseek-official', totals: { ...emptyTotals(), inputTokens: 3000, calls: 1 }, models: [] },
    ]
    const view = render(<UsageSidebarPanel store={store(ready(document_))} poll={() => {}} open={openState(false)} />)

    // When the strip derives today's family totals
    // Then both aliases fold into one figure
    const text = view.container.textContent ?? ''
    expect(text).toContain('5k tokens today')
    expect(text).toContain('2 calls')
  })
})
