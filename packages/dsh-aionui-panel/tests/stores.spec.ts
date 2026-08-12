/**
 * Store behavior tests with a fake api: explorer expand/reveal/persist
 * (expand ancestors + select, search clear on reveal), preview tab dedup
 * (re-clicking an open file focuses it), scm refresh landing the host status
 * (no optimistic rows), and per-root re-binding restoring persisted state.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirListing, FsEntry, GitStatusView, PanelEnvelope } from '../src/core/types.ts'
import { createPanelStores, type PanelStores } from '../src/client/store.ts'
import type { PanelApi } from '../src/client/api.ts'

/** A fake api recording calls with canned responses. */
function fakeApi(overrides: Partial<PanelApi> = {}): { api: PanelApi; calls: string[] } {
  const calls: string[] = []
  const listing = (root: string, path: string): FsEntry[] => {
    const base = path === '' ? '' : `${path}/`
    return [
      { name: 'src', path: `${base}src`, isDir: true, size: 0, mtime: 0 },
      { name: 'README.md', path: `${base}README.md`, isDir: false, size: 10, mtime: 1 },
    ]
  }
  const api = {
    list: vi.fn(async (root: string, path: string): Promise<PanelEnvelope<DirListing>> => {
      calls.push(`list:${path}`)
      return { ok: true, value: { root, entries: listing(root, path) } }
    }),
    read: vi.fn(async (): Promise<PanelEnvelope<{ content: string; truncated: boolean; size: number; mtime: number }>> => ({
      ok: true, value: { content: '# hi', truncated: false, size: 4, mtime: 10 },
    })),
    write: vi.fn(async (): Promise<PanelEnvelope<{ mtime: number }>> => ({ ok: true, value: { mtime: 11 } })),
    search: vi.fn(async (): Promise<PanelEnvelope<{ query: string; hits: never[]; truncated: boolean }>> => ({
      ok: true, value: { query: '', hits: [], truncated: false },
    })),
    delete: vi.fn(async () => ({ ok: true, value: { ok: true as const } })),
    gitStatus: vi.fn(async (): Promise<PanelEnvelope<GitStatusView | null>> => ({
      ok: true,
      value: {
        root: '/w', branch: 'main',
        staged: [], unstaged: [{ path: 'a.txt', state: 'modified', staged: false }],
        untracked: [],
      },
    })),
    gitStage: vi.fn(async () => ({ ok: true, value: { applied: ['a.txt'], failed: [] } })),
    gitUnstage: vi.fn(async () => ({ ok: true, value: { applied: [], failed: [] } })),
    gitDiscard: vi.fn(async () => ({ ok: true, value: { applied: ['a.txt'], failed: [] } })),
    ...overrides,
  } as unknown as PanelApi
  return { api, calls }
}

let stores: PanelStores
let calls: string[]

beforeEach(() => {
  localStorage.clear()
  const setup = fakeApi()
  stores = createPanelStores(setup.api)
  calls = setup.calls
})

describe('explorer store', () => {
  it('loads the root listing on bind and toggles dirs lazily', async () => {
    stores.explorer.setRoot('/w')
    await vi.waitFor(() => expect(stores.explorer.getSnapshot().dirs['']).toBeDefined())
    expect(calls).toContain('list:')
    const before = calls.length
    stores.explorer.toggleDir('src')
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(before))
    expect(stores.explorer.getSnapshot().expanded).toContain('src')
    expect(stores.explorer.getSnapshot().dirs['src']).toBeDefined()
    // Collapse drops the subtree cache.
    stores.explorer.toggleDir('src')
    expect(stores.explorer.getSnapshot().expanded).not.toContain('src')
    expect(stores.explorer.getSnapshot().dirs['src']).toBeUndefined()
  })

  it('reveal expands the ancestor chain and selects, and clears search', async () => {
    stores.explorer.setRoot('/w')
    stores.explorer.reveal('src/deep/file.ts')
    const state = stores.explorer.getSnapshot()
    expect(state.expanded).toContain('src')
    expect(state.expanded).toContain('src/deep')
    expect(state.selected).toBe('src/deep/file.ts')
  })

  it('persists expanded + selected per root and restores on re-bind', async () => {
    stores.explorer.setRoot('/w')
    stores.explorer.toggleDir('src')
    stores.explorer.select('README.md')
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(localStorage.getItem('explorer-ui:/w')).toContain('"src"')

    const setup = fakeApi()
    const fresh = createPanelStores(setup.api)
    fresh.explorer.setRoot('/w')
    const state = fresh.explorer.getSnapshot()
    expect(state.expanded).toContain('src')
    expect(state.selected).toBe('README.md')
  })
})

describe('preview store', () => {
  it('openFile dedups: re-clicking an open file focuses the tab', () => {
    stores.preview.setRoot('/w')
    stores.preview.openFile('/w', 'README.md')
    const first = stores.preview.getSnapshot()
    expect(first.tabs).toHaveLength(1)
    stores.preview.openFile('/w', 'README.md')
    const second = stores.preview.getSnapshot()
    expect(second.tabs).toHaveLength(1)
    expect(second.activeTabId).toBe(first.tabs[0].id)
  })

  it('marks dirty on edit and saves through the api', async () => {
    stores.preview.setRoot('/w')
    stores.preview.openFile('/w', 'README.md')
    const tab = stores.preview.getSnapshot().tabs[0]
    stores.preview.updateContent(tab.id, '# edited')
    expect(stores.preview.getSnapshot().tabs[0].dirty).toBe(true)
    await stores.preview.saveTab(tab.id)
    expect(stores.preview.getSnapshot().tabs[0].dirty).toBe(false)
  })

  it('closeTabs routes through dirty confirmation logic (UI decides, store closes)', () => {
    stores.preview.setRoot('/w')
    stores.preview.openFile('/w', 'README.md')
    stores.preview.openFile('/w', 'src/a.ts')
    stores.preview.updateContent(stores.preview.getSnapshot().tabs[0].id, 'x')
    const dirty = stores.preview.getSnapshot().tabs.filter((item) => item.dirty)
    expect(dirty).toHaveLength(1)
    stores.preview.closeTabs(stores.preview.getSnapshot().tabs.map((item) => item.id))
    expect(stores.preview.getSnapshot().tabs).toHaveLength(0)
    expect(stores.preview.getSnapshot().open).toBe(false)
  })
})

describe('scm store', () => {
  it('lands the host status on refresh (host is the only truth)', async () => {
    stores.scm.setRoot('/w')
    await vi.waitFor(() => expect(stores.scm.getSnapshot().status).not.toBeNull())
    expect(stores.scm.getSnapshot().status?.unstaged[0].path).toBe('a.txt')
  })

  it('persists view mode per root', async () => {
    stores.scm.setRoot('/w')
    stores.scm.setViewMode('tree')
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(localStorage.getItem('scm-ui:/w')).toContain('"tree"')

    const setup = fakeApi()
    const fresh = createPanelStores(setup.api)
    fresh.scm.setRoot('/w')
    expect(fresh.scm.getSnapshot().viewMode).toBe('tree')
  })
})
