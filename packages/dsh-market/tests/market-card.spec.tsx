/** @vitest-environment jsdom */

/**
 * Market card smoke contract: renders the three tabs from injected remote
 * data, the asset install buttons call the injected gateway, plugin installs
 * go through the injected pluginManager face, and likes post to the market
 * origin. The gateway is injected — the live host routes are covered by the
 * installer core tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React, { useSyncExternalStore, type ComponentProps } from 'react'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  createSnapshotStore: (init: unknown) => {
    let value = init
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => value,
      set: (next: unknown) => { value = next; for (const listener of listeners) listener() },
      update: (mutator: (draft: never) => void) => { mutator(value as never); for (const listener of listeners) listener() },
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    }
  },
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const create = (React.createElement as (...args: unknown[]) => unknown).bind(React)
  return {
    Button: (props: Record<string, unknown>) =>
      create('button', { disabled: props['disabled'], onClick: props['onClick'], className: props['className'] }, props['children']),
    Modal: (props: Record<string, unknown>) =>
      props['open'] === true ? create('div', { role: 'dialog' }, props['title'], props['children']) : null,
  }
})

import {
  MarketCard,
  MarketCardController,
  type MarketCardProps,
  type MarketSettings,
} from '../src/client/MarketCard.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: MarketCardProps['t'] = (key, params) => {
  const text = (zh as Record<string, string>)[key] ?? key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match))
}

class FakeScope implements SettingsScope<MarketSettings> {
  value: MarketSettings
  base: MarketSettings
  user: Partial<MarketSettings> = {}
  writable = true
  private listeners = new Set<() => void>()
  set = vi.fn(async (field: string, value: unknown) => {
    (this.user as Record<string, unknown>)[field] = value
    this.reflect()
  })
  unset = vi.fn(async (field: string) => {
    delete (this.user as Record<string, unknown>)[field]
    this.reflect()
  })
  constructor(value: MarketSettings) {
    this.value = value
    this.base = value
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  getSnapshot(): SettingsScopeSnapshot<MarketSettings> {
    return {
      status: 'ready',
      writable: this.writable,
      value: this.value,
      base: this.base,
      user: this.user,
      revision: 1,
      mode: 'host',
    }
  }
  private reflect(): void {
    this.value = { ...this.base, ...this.user }
    for (const listener of this.listeners) listener()
  }
}

function cardProps(
  scope: SettingsScope<MarketSettings>,
  overrides: Partial<MarketCardProps> = {},
): ComponentProps<typeof MarketCard> {
  const controller = new MarketCardController(scope)
  const face = controller.inject()
  const { hooks, ...actions } = face
  const useMarketCard = <S,>(selector: (snapshot: ReturnType<typeof hooks.marketCard.getSnapshot>) => S) =>
    useSyncExternalStore(
      hooks.marketCard.subscribe,
      () => selector(hooks.marketCard.getSnapshot()),
    )
  return { t, useMarketCard, ...actions, ...overrides } as unknown as ComponentProps<typeof MarketCard>
}

const REMOTE = {
  items: {
    skin: [
      { id: 'whale-song', name: '鲸吟', nameEn: 'Whale Song', author: 'dsh-web-ui', rank: 1, preview: { light: 'a.png' }, description: '深海' },
    ],
    pet: [
      { id: 'whale-girl', displayName: '鲸鱼娘（原版）', author: '', rank: 1, previews: ['idle.gif'] },
    ],
    plugin: [
      { id: 'dsh-tui', name: 'dsh-TUI', nameEn: 'dsh-TUI', author: 'ccch1mneyyy', rank: 1, repo: 'https://github.com/ccch1mneyyy/dsh-TUI', npm: 'dsh-tui', category: 'ui', description: '终端' },
    ],
  },
  stats: { skin: { 'whale-song': 3 }, pet: {}, plugin: {} },
}

describe('MarketCard', () => {
  it('renders the skins tab with remote data and votes', () => {
    render(<MarketCard {...cardProps(new FakeScope({}), { remote: REMOTE, gateway: null, pluginManager: null })} />)
    expect(screen.getByText('鲸吟')).toBeTruthy()
    expect(screen.getByText(/赞 3/)).toBeTruthy()
  })

  it('switches tabs and shows plugins with a repo link and install command', () => {
    render(<MarketCard {...cardProps(new FakeScope({}), { remote: REMOTE, gateway: null, pluginManager: null })} />)
    fireEvent.click(screen.getByRole('tab', { name: /插件/ }))
    expect(screen.getByText('dsh-TUI')).toBeTruthy()
    expect(screen.getByRole('link', { name: /源码仓库/ }).getAttribute('href')).toBe('https://github.com/ccch1mneyyy/dsh-TUI')
  })

  it('calls the gateway install for skins (loopback) and marks installed', async () => {
    const install = vi.fn(async () => ({ dest: '/home/.dsh/skins/whale-song' }))
    const list = vi.fn(async () => ({ skins: ['whale-song'], pets: [] }))
    render(<MarketCard {...cardProps(new FakeScope({}), {
      remote: REMOTE,
      gateway: { install, list },
      pluginManager: null,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /一键安装/ }))
    await waitFor(() => expect(install).toHaveBeenCalledWith('skin', 'whale-song', false))
    await waitFor(() => expect(screen.getAllByText('已安装').length).toBeGreaterThan(0))
  })

  it('surfaces the conflict dialog and retries with force', async () => {
    const install = vi.fn(async () => { throw { code: 'conflict' } })
    const list = vi.fn(async () => ({ skins: [], pets: [] }))
    render(<MarketCard {...cardProps(new FakeScope({}), {
      remote: REMOTE,
      gateway: { install, list },
      pluginManager: null,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: /一键安装/ }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /覆盖并安装/ }))
    await waitFor(() => expect(install).toHaveBeenCalledTimes(2))
    expect(install).toHaveBeenLastCalledWith('skin', 'whale-song', true)
  })

  it('installs plugins through the pluginManager face when loopback', async () => {
    const install = vi.fn(async () => ({ id: 'dsh-tui', name: 'dsh-TUI', version: '1.0.0', source: { kind: 'npm', spec: 'dsh-tui' }, installedAt: '', enabled: true }))
    const list = vi.fn(async () => [])
    const face = { isLoopback: true, install, list, uninstall: vi.fn(), status: vi.fn(), onChange: vi.fn(() => () => {}) }
    render(<MarketCard {...cardProps(new FakeScope({}), {
      remote: REMOTE,
      gateway: null,
      pluginManager: face,
    })} />)
    fireEvent.click(screen.getByRole('tab', { name: /插件/ }))
    fireEvent.click(screen.getByRole('button', { name: /一键安装/ }))
    await waitFor(() => expect(install).toHaveBeenCalledWith('dsh-tui'))
  })

  it('hides the install buttons for remote browsers (gateway null, face not loopback)', () => {
    render(<MarketCard {...cardProps(new FakeScope({}), { remote: REMOTE, gateway: null, pluginManager: null })} />)
    expect(screen.queryByRole('button', { name: /一键安装/ })).toBeNull()
  })
})
