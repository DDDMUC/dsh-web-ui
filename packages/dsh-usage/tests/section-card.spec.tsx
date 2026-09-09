/** @vitest-environment jsdom */

/**
 * The section card's configured-provider filter: the balance card and the
 * plans tab render only providers with a resolved credential
 * (credential !== 'none'); unconfigured catalog routes never render, stale
 * unconfigured error lines neither, and the balance card distinguishes
 * "nothing configured" from "configured but no balance endpoint".
 */

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import { UsageSectionCard, type UsageSettings } from '../src/client/UsageSectionCard.tsx'
import { type UsageStoreInstance, type UsageUiState } from '../src/client/usage-store.ts'
import { emptyTotals, type ProviderSnapshotView, type UsageOverviewView } from '../src/core/types.ts'

afterEach(cleanup)

/** A wire provider row with view defaults; callers override the credential. */
function provider(row: Partial<ProviderSnapshotView> & Pick<ProviderSnapshotView, 'provider'>): ProviderSnapshotView {
  return { displayName: row.provider, credential: 'none', supported: true, ...row }
}

/** A minimal overview document: no ledger usage, one current route. */
function overview(providers: ProviderSnapshotView[]): UsageOverviewView {
  return {
    updatedAt: 1_700_000_000_000,
    providers,
    current: { provider: 'deepseek', model: '', source: 'live' },
    usage: {
      today: { date: '2026-01-01', totals: emptyTotals(), providers: [] },
      days: [],
      range: { from: '2026-01-01', to: '2026-01-01', totals: emptyTotals(), providers: [] },
    },
  }
}

/** Stable-reference store fake (a fresh object per getSnapshot would loop useSyncExternalStore). */
function fakeStore(state: UsageUiState): UsageStoreInstance {
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UsageStoreInstance
}

const settings = {
  getSnapshot: () => ({ status: 'ready', writable: true, value: {} }),
  set: async () => {},
} as unknown as SettingsScope<UsageSettings>

function cardProps(snapshot: UsageOverviewView): ComponentProps<typeof UsageSectionCard> {
  return {
    store: fakeStore({ snapshot, status: 'ready', error: null }),
    poll: () => {},
    refresh: () => {},
    settings,
    close: () => {},
  } as unknown as ComponentProps<typeof UsageSectionCard>
}

/** One configured balance provider, one configured plan provider, two unconfigured rows. */
const mixed = [
  provider({ provider: 'deepseek', displayName: 'DeepSeek', credential: 'env', balanceSupported: true, balance: { currency: 'CNY', totalBalance: '42.00', updatedAt: 1 } }),
  provider({ provider: 'kimi-coding', displayName: 'Kimi For Coding', credential: 'api-key', planSupported: true, plan: { windows: [{ key: '5h', percent: 12.5 }], updatedAt: 1 } }),
  provider({ provider: 'zenmux', displayName: 'ZenMux', balanceSupported: true }),
  provider({ provider: 'openai-codex', displayName: 'Codex', planSupported: true, error: 'HTTP 401' }),
]

describe('UsageSectionCard configured-provider filter', () => {
  it('renders only configured providers in the balance card', () => {
    render(<UsageSectionCard {...cardProps(overview(mixed))} />)
    expect(screen.getByText('¥42.00')).toBeTruthy()
    expect(screen.queryByText('ZenMux')).toBeNull()
    expect(screen.queryByText('未配置凭据')).toBeNull()
    expect(screen.queryByText(/HTTP 401/)).toBeNull()
  })

  it('renders only configured providers on the plans tab', () => {
    render(<UsageSectionCard {...cardProps(overview(mixed))} />)
    fireEvent.click(screen.getByRole('tab', { name: '个人套餐' }))
    expect(screen.getByText('Kimi For Coding')).toBeTruthy()
    expect(screen.queryByText('ZenMux')).toBeNull()
    expect(screen.queryByText('Codex')).toBeNull()
  })

  it('shows the none-configured empty states when no provider has a credential', () => {
    const unconfigured = [
      provider({ provider: 'zenmux', displayName: 'ZenMux', balanceSupported: true }),
      provider({ provider: 'openai-codex', displayName: 'Codex', planSupported: true }),
    ]
    render(<UsageSectionCard {...cardProps(overview(unconfigured))} />)
    expect(screen.getByText('没有已配置的提供方')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '个人套餐' }))
    expect(screen.getByText('没有已配置的套餐类 provider（如 Kimi、GLM、OpenCode Go、MiniMax、Codex 订阅）')).toBeTruthy()
  })
})
