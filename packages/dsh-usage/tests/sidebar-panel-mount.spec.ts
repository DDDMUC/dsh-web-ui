/** @vitest-environment jsdom */

/**
 * Sidebar usage panel mount (issue #1592): the mount owns the panel's single
 * open state — initialized from localStorage, flipped by the entry row's
 * toggle controls, persisted on every flip — and seats the React body
 * directly after the entry row.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COLLAPSED_STORAGE_KEY, mountUsagePanel } from '../src/client/sidebar-panel-mount.tsx'
import type { UsageStoreInstance, UsageUiState } from '../src/client/usage-store.ts'

/** Previous localStorage descriptor, restored after each test. */
let originalStorage: PropertyDescriptor | undefined

/**
 * Ensure a working Web Storage backing store. jsdom supplies one, but on
 * Node >= 23 the runtime's own flag-less localStorage shadows it (vitest's
 * populateGlobal keeps the pre-existing global), so a standards-shaped
 * in-memory store takes its place for this spec; CI on Node 22 keeps the
 * jsdom original. Returns the previous descriptor for restoration.
 */
function installStorage(): PropertyDescriptor | undefined {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  if (typeof window.localStorage?.setItem === 'function') return original
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() { return store.size },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (name: string) => store.get(name) ?? null,
      setItem: (name: string, value: string) => { store.set(name, value) },
      removeItem: (name: string) => { store.delete(name) },
      clear: () => { store.clear() },
    },
  })
  return original
}

afterEach(() => {
  document.body.innerHTML = ''
  if (originalStorage !== undefined) Object.defineProperty(globalThis, 'localStorage', originalStorage)
})

beforeEach(() => {
  originalStorage = installStorage()
  window.localStorage.clear()
  document.documentElement.lang = 'en'
})

/** A loading store (the React body is not under test here). */
function store(): UsageStoreInstance {
  const state: UsageUiState = { snapshot: null, status: 'loading', error: null }
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UsageStoreInstance
}

/** The entry row the panel anchors to. */
function entryRow(): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-dsh-usage-entry', '')
  document.body.append(row)
  return row
}

describe('mountUsagePanel persisted open state (issue #1592)', () => {
  it('user collapse choice persists across a remount', () => {
    // Given a mounted panel below its entry row, expanded by default
    entryRow()
    const first = mountUsagePanel({ store: store(), poll: () => {} })
    expect(window.localStorage.getItem(COLLAPSED_STORAGE_KEY)).toBeNull()
    expect(first.isOpen()).toBe(true)

    // When the user collapses the panel
    first.toggle()

    // Then the choice is persisted
    expect(first.isOpen()).toBe(false)
    expect(window.localStorage.getItem(COLLAPSED_STORAGE_KEY)).toBe('1')
    first.dispose()

    // When the panel remounts
    const second = mountUsagePanel({ store: store(), poll: () => {} })

    // Then it remounts collapsed, and expanding clears the flag
    expect(second.isOpen()).toBe(false)
    second.toggle()
    expect(second.isOpen()).toBe(true)
    expect(window.localStorage.getItem(COLLAPSED_STORAGE_KEY)).toBe('0')
    second.dispose()
  })

  it('user toggle notifies the entry row subscribers with the new state', () => {
    // Given a mounted panel with a subscribed entry row
    entryRow()
    const panel = mountUsagePanel({ store: store(), poll: () => {} })
    const seen: boolean[] = []
    panel.subscribe(() => { seen.push(panel.isOpen()) })

    // When the user toggles the panel twice
    panel.toggle()
    panel.toggle()

    // Then every flip reaches the subscriber with the current state
    expect(seen).toEqual([false, true])
    panel.dispose()
  })

  it('user panel stays seated directly after the entry row', () => {
    // Given the entry row followed by a foreign node
    const row = entryRow()
    document.body.append(document.createElement('div'))

    // When the panel mounts
    const panel = mountUsagePanel({ store: store(), poll: () => {} })

    // Then its container lands directly after the entry row
    expect(row.nextElementSibling?.getAttribute('data-dsh-usage-view')).toBe('')
    panel.dispose()
  })
})
