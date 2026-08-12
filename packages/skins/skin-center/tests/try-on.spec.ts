// @vitest-environment jsdom
/**
 * TryOnController regression tests: switching between skin try-ons must
 * never leave residue from the previous skin, and a skin whose apply()
 * throws mid-write must be rolled back completely (the 同花顺 bug: ths reads
 * the optional connection service via ctx.get(), which the try-on miniCtx
 * must answer with undefined — otherwise apply() crashes after writing the
 * body attribute, chrome and style tag, and the residue bleeds into every
 * later try-on).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { SKIN_CENTER_ENTRIES, type SkinCenterEntry } from '../src/client/generated/skins.ts'
import { TryOnController } from '../src/client/try-on.ts'

declare global {
  interface Window {
    __ModuleLoader__?: {
      load(handoff: { id: string; factory: (require: (spec: string) => unknown) => unknown }): void
    }
    __DSH_MODULES__?: {
      import(id: string): Promise<{ apply?: (ctx: unknown) => unknown }>
      invalidate(id: string): void
    }
    __DSH_BOOT__?: { entries: Array<{ id: string }> }
  }
}

/** Minimal ClientModuleSystem stand-in: register factories, materialize on import. */
const factories = new Map<string, (require: (spec: string) => unknown) => unknown>()

beforeEach(() => {
  factories.clear()
  document.head.innerHTML = ''
  document.body.innerHTML = '<div id="root"></div>'
  document.title = 'DeepSeek Harness'
  window.__ModuleLoader__ = {
    load(handoff) {
      if (factories.has(handoff.id)) throw new Error(`duplicate factory ${handoff.id}`)
      factories.set(handoff.id, handoff.factory)
    },
  }
  window.__DSH_MODULES__ = {
    async import(id) {
      const factory = factories.get(id)
      if (factory === undefined) throw new Error(`no factory for ${id}`)
      return factory((spec) => { throw new Error(`unexpected require ${spec}`) }) as never
    },
    invalidate(id) {
      factories.delete(id)
    },
  }
  delete window.__DSH_BOOT__
})

const entry = (id: string): SkinCenterEntry => {
  const found = SKIN_CENTER_ENTRIES.find(candidate => candidate.id === id)
  if (found === undefined) throw new Error(`registry entry missing: ${id}`)
  return found
}

describe('TryOnController skin switching', () => {
  it('switching from ths try-on to another skin leaves no ths residue', async () => {
    const controller = new TryOnController()

    await expect(controller.tryOn(entry('ths'))).resolves.toBeUndefined()
    expect(document.body.getAttribute('data-dsh-ths')).toBe('')
    expect(document.querySelector('style[data-plugin-css*="ths.module.css"]')).not.toBeNull()

    await expect(controller.tryOn(entry('qq98'))).resolves.toBeUndefined()
    expect(document.body.hasAttribute('data-dsh-ths')).toBe(false)
    expect(document.querySelector('style[data-plugin-css*="ths.module.css"]')).toBeNull()
    expect(document.body.querySelector('[class*="thsTitlebar"]')).toBeNull()
    expect(document.body.querySelector('[class*="thsStatusbar"]')).toBeNull()
    // qq98 try-on is live, so the title is qq98's — but never ths's.
    expect(document.title).not.toBe('同花顺 · DeepSeek 在线')
  })

  it('a skin whose apply() throws mid-write is rolled back completely', async () => {
    const bomb: SkinCenterEntry = {
      id: 'bomb',
      name: 'Bomb',
      nameEn: 'Bomb',
      tagline: '',
      accent: '#000',
      bodyAttr: 'data-dsh-bomb',
      package: '@deepseek-ai/dsh-client-ui-skin-bomb',
      bundle: [
        'window.__ModuleLoader__.load({',
        '  id: "@deepseek-ai/dsh-client-ui-skin-bomb",',
        '  factory: (require) => {',
        '    var module = { exports: {} };',
        '    var exports = module.exports;',
        '    exports.apply = function () {',
        '      document.body.setAttribute("data-dsh-bomb", "");',
        '      var chrome = document.createElement("div");',
        '      chrome.className = "bombChrome";',
        '      document.body.appendChild(chrome);',
        '      throw new Error("boom");',
        '    };',
        '    return module.exports;',
        '  }',
        '})',
      ].join('\n'),
    }
    const controller = new TryOnController()

    await expect(controller.tryOn(bomb)).rejects.toThrow('boom')
    expect(document.body.hasAttribute('data-dsh-bomb')).toBe(false)
    expect(document.body.querySelector('.bombChrome')).toBeNull()

    // The surface stays usable for the next try-on.
    await expect(controller.tryOn(entry('qq98'))).resolves.toBeUndefined()
    expect(document.body.hasAttribute('data-dsh-bomb')).toBe(false)
    expect(document.querySelector('style[data-plugin-css*="qq98.module.css"]')).not.toBeNull()
  })
})
