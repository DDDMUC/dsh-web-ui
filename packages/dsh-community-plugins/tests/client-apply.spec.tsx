/** @vitest-environment jsdom */

/**
 * Community Plugins client two-seat wiring: with the DSH Market hub declared
 * the card registers into `dsh-market.tab` (the Community Plugins tab),
 * and standalone it falls back to its own first-level `settings.section`
 * entry. The seat machine itself is covered by the shared market-tab spec;
 * this test pins the package's own ids, orders and locale.
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

function labelOf(entry: Record<string, unknown> | undefined): unknown {
  return typeof entry?.label === 'function' ? (entry.label as () => string)() : undefined
}

const emptyScope = {
  bind: () => ({
    subscribe: () => () => {},
    getSnapshot: () => ({ status: 'ready', writable: true, value: { enabled: true }, base: {}, user: {}, revision: 1, mode: 'host' }),
  }),
}

function makeCtx(declared: string[]) {
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
      inject: (name: string, fn: () => unknown) => {
        if (declared.includes(name)) fn()
        return () => {}
      },
      register: (options: Record<string, unknown>) => { registered.push(options); return () => {} },
    },
  }
  return { fakeCtx, registered }
}

describe('community-plugins client two-seat wiring', () => {
  it('hub mode: registers the Community Plugins tab entry', () => {
    const { fakeCtx, registered } = makeCtx(['settings.section', 'dsh-market.tab'])
    apply(fakeCtx as never)
    const tab = registered.find((entry) => entry.name === 'dsh-market.tab' && entry.id === 'community-plugins')
    expect(tab).toBeDefined()
    expect(tab?.order).toBe(400)
    expect(tab?.locale).toBe('community-plugins')
    expect(labelOf(tab)).toBe('settings.title')
  })

  it('standalone mode: falls back to its own first-level settings section', () => {
    const { fakeCtx, registered } = makeCtx(['settings.section'])
    apply(fakeCtx as never)
    const section = registered.find((entry) => entry.name === 'settings.section' && entry.id === 'community-plugins')
    expect(section).toBeDefined()
    expect(section?.order).toBe(140)
    const tab = registered.find((entry) => entry.name === 'dsh-market.tab')
    expect(tab).toBeUndefined()
  })
})
