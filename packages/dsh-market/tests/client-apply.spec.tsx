/** @vitest-environment jsdom */

/**
 * Workshop client registration: apply() contributes ONE first-level
 * settings section (id `dsh-web-ui-market`) that renders the store card directly —
 * no tab slot, no hub wrapper. The old hub-based registrations (the
 * `dsh-market.tab` child slot and the Store tab entry) must be gone.
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

describe('dsh-web-ui-market client store registration', () => {
  it('registers the single dsh-web-ui-market section rendering the store card', () => {
    const { fakeCtx, injected, registered } = makeCtx()
    apply(fakeCtx as never)

    expect(injected).toEqual(['settings.section'])

    const section = registered.find((entry) => entry.name === 'settings.section' && entry.id === 'dsh-web-ui-market') as RegisteredEntry | undefined
    expect(section).toBeDefined()
    expect(section?.children).toBeUndefined()
    expect(section?.order).toBe(150)
    expect(section?.locale).toBe('dsh-web-ui-market')
    expect(labelOf(section)).toBe('settings.title')
  })

  it('no longer registers any tab slot entry', () => {
    const { fakeCtx, registered } = makeCtx()
    apply(fakeCtx as never)

    expect(registered.some((entry) => entry.name === 'dsh-market.tab')).toBe(false)
  })
})
