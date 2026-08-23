/** @vitest-environment jsdom */

/**
 * DSH Market hub client registration: apply() contributes ONE first-level
 * settings section (id `dsh-market`) declaring the `dsh-market.tab` child
 * slot, and registers the Store card itself as the first tab entry. The old
 * standalone `market` section id must be gone — the hub is the single
 * first-level entry of the market family.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/plugin-manager-bridge.ts', () => ({
  bridgePluginManager: () => {},
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: Record<string, unknown>) => null,
  Modal: (props: Record<string, unknown>) => null,
}))

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

import { apply } from '../src/client/index.ts'

interface RegisteredEntry {
  name: string
  id?: string
  order?: number
  label?: unknown
  locale?: string
  children?: unknown
}

function labelOf(entry: RegisteredEntry | undefined): unknown {
  return typeof entry?.label === 'function' ? (entry.label as () => string)() : undefined
}

const emptyScope = {
  bind: () => ({
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready', writable: true, value: { enabled: true }, base: {}, user: {}, revision: 1, mode: 'host' }),
  }),
}

function makeCtx() {
  const injected: string[] = []
  const registered: Array<Record<string, unknown>> = []
  const fakeCtx = {
    effect: (fn: () => unknown) => { fn(); return () => {} },
    locale: {
      register: () => {},
      bind: () => (key: string) => key,
    },
    get: () => undefined,
    settingsScope: emptyScope as never,
    slots: {
      inject: (name: string, fn: () => unknown) => { injected.push(name); fn(); return () => {} },
      register: (options: Record<string, unknown>) => { registered.push(options); return () => {} },
    },
  }
  return { fakeCtx, injected, registered }
}

describe('dsh-market client hub registration', () => {
  it('registers the single dsh-market section declaring the tab child slot', () => {
    const { fakeCtx, injected, registered } = makeCtx()
    apply(fakeCtx as never)

    expect(injected).toContain('settings.section')

    const section = registered.find((entry) => entry.name === 'settings.section' && entry.id === 'dsh-market') as RegisteredEntry | undefined
    expect(section).toBeDefined()
    expect(section?.children).toEqual({ 'dsh-market.tab': { kind: 'list', scope: 'root' } })
    expect(section?.order).toBe(150)
    expect(labelOf(section)).toBe('hub.title')

    // The old standalone market section id is replaced by the hub.
    expect(registered.some((entry) => entry.name === 'settings.section' && entry.id === 'market')).toBe(false)
  })

  it('registers the Store card as the first market tab entry', () => {
    const { fakeCtx, registered } = makeCtx()
    apply(fakeCtx as never)

    const tab = registered.find((entry) => entry.name === 'dsh-market.tab' && entry.id === 'market') as RegisteredEntry | undefined
    expect(tab).toBeDefined()
    expect(tab?.order).toBe(100)
    expect(tab?.locale).toBe('dsh-market')
    expect(labelOf(tab)).toBe('tab.shop')
  })
})
