import { describe, expect, it } from 'vitest'
import { diffLayer, type LayerSnapshot } from '../src/core/patch-diff.ts'

const snap = (rows: Record<string, boolean>, bundles: string[] = []): LayerSnapshot => ({
  rows: new Map(Object.entries(rows)),
  bundles,
})

describe('diffLayer', () => {
  it('reports row flips and skips unchanged entries', () => {
    const before = snap({ a: true, b: true, keep: false })
    const after = snap({ a: false, b: true, keep: false })
    expect(diffLayer(before, after)).toEqual([{ id: 'a', from: 'enabled', to: 'disabled' }])
  })

  it('reports entries appearing and disappearing as install/uninstall moves', () => {
    const before = snap({ a: true })
    const after = snap({ b: true })
    expect(diffLayer(before, after)).toEqual([
      { id: 'a', from: 'enabled', to: 'uninstalled' },
      { id: 'b', from: 'uninstalled', to: 'enabled' },
    ])
  })

  it('treats a removed bundle like a removed entry', () => {
    const before = snap({}, ['@linxin666/dsh-web-ui-all'])
    const after = snap({}, [])
    expect(diffLayer(before, after)).toEqual([
      { id: '@linxin666/dsh-web-ui-all', from: 'enabled', to: 'uninstalled' },
    ])
  })

  it('a bundle removed with a disabled row present reports the row state', () => {
    const before = snap({ webui: false }, ['webui'])
    const after = snap({}, [])
    expect(diffLayer(before, after)).toEqual([{ id: 'webui', from: 'disabled', to: 'uninstalled' }])
  })
})
