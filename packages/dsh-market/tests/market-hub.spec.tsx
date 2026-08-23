/** @vitest-environment jsdom */

/**
 * DSH Market hub smoke contract: the hub renders the declared category tab
 * bar from the live slot entries, mounts exactly one panel at a time (the
 * `only` dispatch filter), defaults to the first tab, and passes the
 * section's `close` owner share down to every tab panel.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { MarketHub, type MarketHubProps } from '../src/client/MarketHub.tsx'
import type { MarketTabRecord } from '../src/client/market-tab.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const t: MarketHubProps['t'] = (key) => (zh as Record<string, string>)[key] ?? key

const tabs: MarketTabRecord[] = [
  { id: 'market', label: '商店' },
  { id: 'skin-center', label: '皮肤中心' },
]

function renderHub(close: () => void): ReturnType<typeof vi.fn> {
  const renderSlot = vi.fn((_key: string, owner: { close: () => void }, opts: { only?: string }) => (
    <div data-active={opts?.only} data-close-passed={owner.close === close}>panel</div>
  ))
  render(React.createElement(MarketHub, {
    t,
    useMarketTabs: (select) => select(tabs),
    renderSlot,
    close,
  } as unknown as MarketHubProps))
  return renderSlot
}

describe('MarketHub', () => {
  it('renders the tab bar and mounts the first tab by default', () => {
    const renderSlot = renderHub(() => {})
    expect(screen.getByRole('tab', { name: '商店' })).toBeDefined()
    expect(screen.getByRole('tab', { name: '皮肤中心' })).toBeDefined()
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('商店')
    expect(renderSlot).toHaveBeenCalledTimes(1)
    expect(renderSlot.mock.calls[0][0]).toBe('dsh-market.tab')
    expect(renderSlot.mock.calls[0][2]).toEqual({ only: 'market' })
    expect(screen.getByText('panel').getAttribute('data-active')).toBe('market')
  })

  it('switches the mounted panel on tab click and passes close through', () => {
    const close = vi.fn()
    const renderSlot = renderHub(close)
    fireEvent.click(screen.getByRole('tab', { name: '皮肤中心' }))
    expect(renderSlot).toHaveBeenCalledTimes(2)
    expect(renderSlot.mock.calls[1][2]).toEqual({ only: 'skin-center' })
    expect(screen.getByText('panel').getAttribute('data-close-passed')).toBe('true')
  })

  it('handles a picked tab disappearing (entry unregistered)', () => {
    const renderSlot = vi.fn((_key: string, _owner: unknown, opts: { only?: string }) => (
      <div data-active={opts?.only}>panel</div>
    ))
    const { rerender } = render(React.createElement(MarketHub, {
      t,
      useMarketTabs: (select) => select(tabs),
      renderSlot,
      close: () => {},
    } as unknown as MarketHubProps))
    fireEvent.click(screen.getByRole('tab', { name: '皮肤中心' }))
    expect(renderSlot.mock.calls[1][2]).toEqual({ only: 'skin-center' })
    rerender(React.createElement(MarketHub, {
      t,
      useMarketTabs: (select) => select([
        { id: 'market', label: '商店' },
      ]),
      renderSlot,
      close: () => {},
    } as unknown as MarketHubProps))
    // The stale pick falls back to the first available tab.
    expect(renderSlot.mock.calls[renderSlot.mock.calls.length - 1][2]).toEqual({ only: 'market' })
  })
})
