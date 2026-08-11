import { describe, expect, it } from 'vitest'
import { createCodeKlineStore } from '../src/client/store.ts'

describe('code-kline store', () => {
  it('starts empty', () => {
    const handle = createCodeKlineStore()
    const instance = handle.create()
    expect(instance.getSnapshot()).toEqual({ entries: {}, expanded: [] })
  })

  it('setEntry writes one workspace entry', () => {
    const handle = createCodeKlineStore()
    const instance = handle.create()
    instance.actions.setEntry('ws-1', {
      workspaceId: 'ws-1' as never,
      candles: [],
      state: 'loading',
      error: null,
    })
    expect(instance.getSnapshot().entries['ws-1']?.state).toBe('loading')
  })

  it('setEntry replaces a previous entry', () => {
    const handle = createCodeKlineStore()
    const instance = handle.create()
    instance.actions.setEntry('ws-1', { workspaceId: 'ws-1' as never, candles: [], state: 'loading', error: null })
    instance.actions.setEntry('ws-1', { workspaceId: 'ws-1' as never, candles: [], state: 'error', error: null })
    expect(instance.getSnapshot().entries['ws-1']?.state).toBe('error')
  })

  it('each create() instance is freshly seeded', () => {
    const handle = createCodeKlineStore()
    const a = handle.create()
    a.actions.setEntry('ws-1', { workspaceId: 'ws-1' as never, candles: [], state: 'loading', error: null })
    const b = handle.create()
    expect(b.getSnapshot()).toEqual({ entries: {}, expanded: [] })
  })

  it('toggleBranch expands and collapses one workspace', () => {
    const handle = createCodeKlineStore()
    const instance = handle.create()
    instance.actions.toggleBranch('ws-1')
    expect(instance.getSnapshot().expanded).toEqual(['ws-1'])
    instance.actions.toggleBranch('ws-1')
    expect(instance.getSnapshot().expanded).toEqual([])
  })
})
