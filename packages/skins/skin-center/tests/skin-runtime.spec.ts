/**
 * Client runtime tests: decoration layers, semantic adapter, skin controller
 * (jsdom). Pins the activation lifecycle semantics of issue #506.
 */

// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import { createEffectLedger } from '../src/client/runtime/effect-ledger.ts'
import {
  buildBackgroundMedia,
  ensureDecorationLayers,
  setLayerContent,
} from '../src/client/runtime/decoration-layers.ts'
import { createSemanticAdapter } from '../src/client/runtime/semantic-adapter.ts'
import { createSkinController } from '../src/client/runtime/skin-controller.ts'
import type { ControllerSkinEntry } from '../src/client/runtime/skin-controller.ts'

const hookedEntry = {
    manifest: {
      id: 'hooked',
      contributes: { stylesheet: 'skin.css' },
      facets: { client: { entry: 'hooks.mjs', apiVersion: 'x-org.linxin666.skin-center/v1alpha1' } },
    },
  } as ControllerSkinEntry

function entryFor(id: string, extra: Record<string, unknown> = {}): ControllerSkinEntry {
  return {
    manifest: {
      id,
      contributes: { stylesheet: 'skin.css', ...extra },
    },
  } as ControllerSkinEntry
}

describe('decoration layers', () => {
  it('ensures six non-interactive layers idempotently', () => {
    const layers = ensureDecorationLayers(document)
    expect(Object.keys(layers)).toHaveLength(6)
    for (const el of Object.values(layers)) {
      expect(el.style.pointerEvents).toBe('none')
    }
    const again = ensureDecorationLayers(document)
    expect(again.background).toBe(layers.background)
  })

  it('setLayerContent teardown removes exactly its nodes, idempotently', () => {
    const layers = ensureDecorationLayers(document)
    const node = document.createElement('div')
    const teardown = setLayerContent(layers.top, [node])
    expect(layers.top.contains(node)).toBe(true)
    teardown()
    teardown()
    expect(layers.top.contains(node)).toBe(false)
  })

  it('builds image media with scrim', () => {
    const nodes = buildBackgroundMedia(document, { type: 'image', src: 'assets/bg.jpg', scrim: '#0008' }, '/x/skins/h')
    expect(nodes).toHaveLength(2)
    expect((nodes[0] as HTMLImageElement).src).toContain('/x/skins/h/assets/bg.jpg')
  })
})

describe('semantic adapter', () => {
  it('stamps surfaces and parts on existing and added nodes', async () => {
    document.body.innerHTML = `
      <div data-slot="sidebar"></div>
      <div data-chat-flow-kind="message"></div>
    `
    const adapter = createSemanticAdapter(document)
    adapter.start()
    expect(document.querySelector('[data-slot="sidebar"]')!.getAttribute('data-dsh-surface')).toBe('sidebar')
    expect(document.querySelector('[data-chat-flow-kind]')!.getAttribute('data-dsh-part')).toBe('message-row')

    const added = document.createElement('div')
    added.setAttribute('data-turn-tail', '')
    document.body.appendChild(added)
    await new Promise((r) => setTimeout(r, 0))
    expect(added.getAttribute('data-dsh-part')).toBe('turn-tail')
    adapter.stop()
  })

  it('tags plugin roots', () => {
    document.body.innerHTML = '<div data-dsh-ssh-view></div>'
    const adapter = createSemanticAdapter(document)
    adapter.start()
    expect(document.querySelector('[data-dsh-ssh-view]')!.getAttribute('data-dsh-plugin')).toBe('ssh')
    adapter.stop()
  })

  it('reports unmatched rules as diagnostics without throwing', () => {
    document.body.innerHTML = '<div></div>'
    const adapter = createSemanticAdapter(document)
    adapter.start()
    const diag = adapter.diagnostics()
    expect(diag.unmatchedRules.length).toBeGreaterThan(0)
    adapter.stop()
  })
})

describe('skin controller', () => {
  function harness(options: {
    hooks?: Record<string, unknown>
    failFetchFor?: string[]
    persist?: (id: string | null) => Promise<void>
  } = {}) {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-dsh-skin')
    const ledger = createEffectLedger()
    const fetchImpl = vi.fn(async (url: string) => {
      for (const bad of options.failFetchFor ?? []) {
        if (url.includes(bad)) return { ok: false, status: 500, text: async () => '' } as Response
      }
      if (url.endsWith('/stylesheet')) return { ok: true, status: 200, text: async () => 'html[data-dsh-skin] .x { color: red; }' } as Response
      if (url.endsWith('/patches')) return { ok: true, status: 200, text: async () => 'html[data-dsh-skin] .y { color: blue; }' } as Response
      return { ok: true, status: 200, text: async () => '{}' } as Response
    })
    const errors: string[] = []
    const controller = createSkinController({
      doc: document,
      ledger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      importHooks: async () => options.hooks,
      persist: options.persist ?? (async () => {}),
      onError: (m) => errors.push(m),
    })
    return { ledger, controller, errors, fetchImpl }
  }

  it('applies a skin: styles, attribute, persistence', async () => {
    const persist = vi.fn(async () => {})
    const { controller } = harness({ persist })
    const result = await controller.switchTo('harbor', entryFor('harbor', { patches: 'patches.css' }))
    expect(result).toBe('harbor')
    expect(controller.active).toBe('harbor')
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe('harbor')
    const styles = document.head.querySelectorAll('style[data-dsh-skin-style]')
    expect(styles).toHaveLength(2)
    expect(persist).toHaveBeenCalledWith('harbor')
  })

  it('switching replaces the old activation completely', async () => {
    const { controller, ledger } = harness()
    await controller.switchTo('harbor', entryFor('harbor'))
    expect(document.head.querySelectorAll('style[data-dsh-skin-style]')).toHaveLength(1)
    await controller.switchTo('matrix', entryFor('matrix'))
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe('matrix')
    expect(document.head.querySelectorAll('style[data-dsh-skin-style]')).toHaveLength(1)
    expect(ledger.entries().some((e) => e.kind === 'release')).toBe(true)
  })

  it('switch to stock removes styles and the attribute', async () => {
    const { controller } = harness()
    await controller.switchTo('harbor', entryFor('harbor'))
    await controller.switchTo(null, null)
    expect(controller.active).toBeNull()
    expect(document.documentElement.hasAttribute('data-dsh-skin')).toBe(false)
    expect(document.head.querySelectorAll('style[data-dsh-skin-style]')).toHaveLength(0)
  })

  it('a failed fetch leaves the previous skin intact', async () => {
    const { controller, errors } = harness({ failFetchFor: ['matrix'] })
    await controller.switchTo('harbor', entryFor('harbor'))
    const before = document.head.querySelectorAll('style').length
    const result = await controller.switchTo('matrix', entryFor('matrix'))
    expect(result).toBe('harbor')
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe('harbor')
    expect(document.head.querySelectorAll('style').length).toBe(before)
    expect(errors.some((m) => m.includes('matrix'))).toBe(true)
  })

  it('latest request wins: a stale in-flight switch is discarded', async () => {
    document.head.innerHTML = ''
    document.documentElement.removeAttribute('data-dsh-skin')
    const ledger = createEffectLedger()
    let resolveSlow!: (v: Response) => void
    const slow = new Promise<Response>((r) => { resolveSlow = r })
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes('slow-skin')) return slow
      return Promise.resolve({ ok: true, status: 200, text: async () => '.a{}' } as Response)
    })
    const controller = createSkinController({
      doc: document,
      ledger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      persist: async () => {},
    })
    const first = controller.switchTo('slow-skin', entryFor('slow-skin'))
    const second = controller.switchTo('fast-skin', entryFor('fast-skin'))
    resolveSlow({ ok: true, status: 200, text: async () => '.slow{}' } as Response)
    await Promise.all([first, second])
    expect(controller.active).toBe('fast-skin')
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe('fast-skin')
    const styles = Array.from(document.head.querySelectorAll('style'))
    expect(styles.some((s) => s.textContent?.includes('.slow'))).toBe(false)
  })

  it('hooks failure keeps the static skin and reports the error', async () => {
    const { controller, errors } = harness({
      hooks: { default: () => ({ apply() { throw new Error('boom') } }) },
    })
    const result = await controller.switchTo('hooked', hookedEntry)
    expect(result).toBe('hooked')
    expect(document.documentElement.getAttribute('data-dsh-skin')).toBe('hooked')
    expect(errors.some((m) => m.includes('hooks failed'))).toBe(true)
  })

  it('hooks onCleanup runs on the next switch', async () => {
    const cleanup = vi.fn()
    const { controller } = harness({
      hooks: {
        default: () => ({
          apply(ctx: { onCleanup: (fn: () => void) => void }) { ctx.onCleanup(cleanup) },
        }),
      },
    })
    await controller.switchTo('hooked', hookedEntry)
    expect(cleanup).not.toHaveBeenCalled()
    await controller.switchTo(null, null)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('shutdown disposes the activation and clears the attribute', async () => {
    const { controller } = harness()
    await controller.switchTo('harbor', entryFor('harbor'))
    controller.shutdown()
    expect(controller.active).toBeNull()
    expect(document.documentElement.hasAttribute('data-dsh-skin')).toBe(false)
    expect(document.head.querySelectorAll('style[data-dsh-skin-style]')).toHaveLength(0)
  })
})
