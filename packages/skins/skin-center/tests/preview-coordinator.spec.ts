import { describe, expect, it, vi } from 'vitest'
import { PreviewCoordinator } from '../src/client/preview-coordinator.ts'

describe('PreviewCoordinator', () => {
  it('waits for a skin preview to exit before applying a wallpaper', async () => {
    let release!: () => void
    const exited = new Promise<void>(resolve => { release = resolve })
    const calls: string[] = []
    const skin = {
      getState: () => ({ previewing: true }),
      exitTryOn: vi.fn(async () => { calls.push('skin-exit-start'); await exited; calls.push('skin-exit-end'); return null }),
    }
    const wallpaper = { trying: () => false, exitTryOn: vi.fn() }
    const coordinator = new PreviewCoordinator(skin, wallpaper)
    const pending = coordinator.runWallpaper(() => { calls.push('wallpaper-apply') })
    await Promise.resolve()
    expect(calls).toEqual(['skin-exit-start'])
    release()
    await pending
    expect(calls).toEqual(['skin-exit-start', 'skin-exit-end', 'wallpaper-apply'])
  })

  it('retires the wallpaper preview before starting a skin transition', async () => {
    const calls: string[] = []
    const skin = { getState: () => ({ previewing: false }), exitTryOn: vi.fn(async () => null) }
    const wallpaper = { trying: () => true, exitTryOn: vi.fn(() => { calls.push('wallpaper-exit') }) }
    const coordinator = new PreviewCoordinator(skin, wallpaper)
    await coordinator.runSkin(async () => { calls.push('skin-start'); return null })
    expect(calls).toEqual(['wallpaper-exit', 'skin-start'])
  })

  it('serializes rapid cross-dimension actions in click order', async () => {
    const calls: string[] = []
    const skin = { getState: () => ({ previewing: false }), exitTryOn: vi.fn(async () => null) }
    const wallpaper = { trying: () => false, exitTryOn: vi.fn() }
    const coordinator = new PreviewCoordinator(skin, wallpaper)
    const first = coordinator.runSkin(async () => { calls.push('skin'); return null })
    const second = coordinator.runWallpaper(() => { calls.push('wallpaper') })
    await Promise.all([first, second])
    expect(calls).toEqual(['skin', 'wallpaper'])
  })
})
