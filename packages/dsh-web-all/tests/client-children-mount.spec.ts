import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountClientChildren } from '../src/client/mount-children.ts'

const MOUNTED_PLUGINS = Symbol.for('dsh-web.mounted-plugins')

vi.mock('../src/client/children.generated.ts', () => ({
  clientChildren: [
    { name: '@linxin666/fake-own-entry', module: { apply: () => {} } },
    { name: '@linxin666/fake-mounts', module: { apply: () => {} } },
    { name: '@linxin666/fake-sync-throw', module: { apply: () => {} } },
    { name: '@linxin666/fake-no-apply', module: {} },
    { name: '@linxin666/dsh-client-ui-plugin-manager', module: { apply: () => {} } },
  ],
}))

interface RecordedDefinition {
  name: string
  inject: string[]
  apply: unknown
}

function fakeCtx(outcomes: Record<string, 'ok' | 'reject' | 'throw'> = {}) {
  const mounted: Array<RecordedDefinition> = []
  const ctx = {
    plugin(def: RecordedDefinition) {
      const outcome = outcomes[def.name] ?? 'ok'
      if (outcome === 'throw') throw new Error('sync boom')
      if (outcome === 'reject') return Promise.reject(new Error('async boom'))
      mounted.push(def)
      return Promise.resolve()
    },
  }
  return { ctx: ctx as never, mounted }
}

function bootWith(entries: Array<string | { id?: string; name?: string; disabled?: boolean }>): void {
  vi.stubGlobal('__DSH_BOOT__', {
    entries: entries.map((entry) => typeof entry === 'string' ? { id: entry } : entry),
  })
}

describe('mountClientChildren', () => {
  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[MOUNTED_PLUGINS]
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(console.error).mockRestore()
  })

  it('skips children the loader serves through their own entries and mounts the rest', () => {
    bootWith(['@linxin666/fake-own-entry'])
    const { ctx, mounted } = fakeCtx()
    mountClientChildren(ctx)
    expect(mounted.map((def) => def.name)).toEqual(['@linxin666/fake-mounts', '@linxin666/fake-sync-throw'])
    expect(mounted[0].inject).toEqual([])
  })

  it('mounts every child when no boot payload is present', () => {
    const { ctx, mounted } = fakeCtx()
    mountClientChildren(ctx)
    expect(mounted).toHaveLength(4) // every child except the no-apply shape
  })

  it('gates known child rows based on active boot entries (#1372)', () => {
    // 1. When child row is not in entries, its client UI is not mounted
    bootWith(['web-ui-settings'])
    const { ctx: ctx1, mounted: mounted1 } = fakeCtx()
    mountClientChildren(ctx1)
    expect(mounted1.some(def => def.name === '@linxin666/dsh-client-ui-plugin-manager')).toBe(false)

    // Reset mount registry for next run
    delete (globalThis as Record<symbol, unknown>)[MOUNTED_PLUGINS]

    // 2. When child row is explicitly disabled in entries, it is skipped
    bootWith([{ id: 'web-ui-plugin-manager', disabled: true }])
    const { ctx: ctx2, mounted: mounted2 } = fakeCtx()
    mountClientChildren(ctx2)
    expect(mounted2.some(def => def.name === '@linxin666/dsh-client-ui-plugin-manager')).toBe(false)

    delete (globalThis as Record<symbol, unknown>)[MOUNTED_PLUGINS]

    // 3. When child row is active, it mounts normally
    bootWith(['web-ui-plugin-manager'])
    const { ctx: ctx3, mounted: mounted3 } = fakeCtx()
    mountClientChildren(ctx3)
    expect(mounted3.some(def => def.name === '@linxin666/dsh-client-ui-plugin-manager')).toBe(true)
  })

  it('keeps mounting siblings when one child throws synchronously', () => {
    bootWith([])
    const { ctx, mounted } = fakeCtx({ '@linxin666/fake-mounts': 'throw' })
    expect(() => mountClientChildren(ctx)).not.toThrow()
    expect(mounted.map((def) => def.name)).toEqual(['@linxin666/fake-own-entry', '@linxin666/fake-sync-throw'])
    expect(console.error).toHaveBeenCalledTimes(2) // the throw + the no-apply shape
  })

  it('captures async fiber rejections without escaping', async () => {
    bootWith([])
    const { ctx, mounted } = fakeCtx({ '@linxin666/fake-sync-throw': 'reject' })
    mountClientChildren(ctx)
    expect(mounted.map((def) => def.name)).toEqual(['@linxin666/fake-own-entry', '@linxin666/fake-mounts'])
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
    expect(console.error).toHaveBeenCalledWith(
      '[dsh-web-all] client child degraded: @linxin666/fake-sync-throw',
      expect.any(Error),
    )
  })

  it('honours the shared mount registry across instances', () => {
    bootWith([])
    ;(globalThis as Record<symbol, unknown>)[MOUNTED_PLUGINS] = new Set(['@linxin666/fake-mounts'])
    const { ctx, mounted } = fakeCtx()
    mountClientChildren(ctx)
    expect(mounted.map((def) => def.name)).toEqual(['@linxin666/fake-own-entry', '@linxin666/fake-sync-throw'])
  })
})
