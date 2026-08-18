/**
 * Skin runtime controller (issue #506, contract section 8) — the browser
 * switch engine. One switch is one NEW activation identity:
 *
 *   switchTo(id):
 *     1. seq = ++latestRequest          (latest-request-wins)
 *     2. activation = ledger.beginActivation()
 *     3. fetch stylesheet (+ patches)   (already scoped + whitelisted host-side)
 *     4. install <style> tags, background media, hooks (all ledger-recorded)
 *     5. if seq is stale -> dispose this activation and bail
 *     6. flip html[data-dsh-skin]       (the atomic visual cut)
 *     7. dispose the previous activation
 *     8. persist the selection
 *
 * Every step before the flip is discardable; a stale or failed switch leaves
 * the previous skin fully intact. hooks import/apply errors are caught: the
 * static part (stylesheet, media) stays active — the escape hatch can never
 * take the skin down with it.
 *
 * lifecycleScope split: the ledger tracks activation scope; the catalog
 * snapshot, the decoration layer elements and the persisted selection are
 * component scope and survive every switch.
 * @module @linxin666/dsh-client-ui-skin-center/runtime/skin-controller
 */

import type { EffectLedger } from './effect-ledger.ts'
import {
  buildBackgroundMedia,
  clearLayer,
  ensureDecorationLayers,
  setLayerContent,
} from './decoration-layers.ts'
import type { DecorationLayers } from './decoration-layers.ts'

/** Catalog entry shape the controller needs (mirrors the v2 catalog route). */
export interface ControllerSkinEntry {
  manifest: {
    id: string
    contributes: {
      stylesheet: string
      patches?: string
      backgroundMedia?: {
        light?: { type: 'image' | 'video'; src: string; scrim?: string }
        dark?: { type: 'image' | 'video'; src: string; scrim?: string }
      }
    }
    facets?: { client?: { entry: string; apiVersion: string } }
  }
}

export interface SkinControllerDeps {
  doc: Document
  ledger: EffectLedger
  /** Same-origin base of the v2 API (default /api/skin-center/v2). */
  apiBase?: string
  /** fetch injection for tests. */
  fetchImpl?: typeof fetch
  /** Persist the selection (POST /active by default). */
  persist?: (id: string | null) => Promise<void>
  /** Current light/dark theme (defaults to body[data-ds-dark-theme]). */
  themeGet?: () => 'light' | 'dark'
  themeSubscribe?: (listener: (theme: 'light' | 'dark') => void) => () => void
  /** hooks.mjs dynamic import seam for tests. */
  importHooks?: (url: string) => Promise<unknown>
  /** Diagnostics sink (switch failures, hook errors). */
  onError?: (message: string, error: unknown) => void
}

export interface SkinControllerState {
  /** The currently applied skin (null = stock look). */
  active: string | null
  /** The previewed skin id (null = the stock look is being previewed). */
  trying: string | null
  /** Whether a try-on preview is live (distinguishes previewing the stock
   *  look from having no preview). */
  previewing: boolean
}

export interface SkinController {
  /** Current applied skin id (null = stock look). */
  readonly active: string | null
  /** The fixed decoration layer handles (component scope). */
  readonly layers: DecorationLayers
  /**
   * Switch to a skin (or null for stock). Latest request wins; resolves to
   * the id that is actually active after this call settles (which may be a
   * newer one if a later switch superseded it).
   */
  switchTo(id: string | null, entry: ControllerSkinEntry | null): Promise<string | null>
  /**
   * Preview a skin without persisting it. The committed skin is remembered;
   * exitTryOn() restores it. Try-on of the stock look passes null.
   */
  tryOn(id: string | null, entry: ControllerSkinEntry | null): Promise<string | null>
  /** Leave the preview, restoring the committed skin. */
  exitTryOn(): Promise<string | null>
  /** React-friendly store: subscribe + snapshot of {active, trying}. */
  subscribe(listener: () => void): () => void
  getState(): SkinControllerState
  /** Dispose the current activation (e.g. on plugin teardown). */
  shutdown(): void
}

interface HooksModule {
  default?: () => { apply(ctx: unknown): void; dispose?: () => void }
}

export function createSkinController(deps: SkinControllerDeps): SkinController {
  const doc = deps.doc
  const ledger = deps.ledger
  const apiBase = deps.apiBase ?? '/api/skin-center/v2'
  const fetchImpl = deps.fetchImpl ?? fetch.bind(doc.defaultView)
  const layers = ensureDecorationLayers(doc)
  const onError = deps.onError ?? (() => {})

  const themeGet = deps.themeGet ?? (() =>
    (doc.body?.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'))

  let latestRequest = 0
  let currentActivation: number | null = null
  let active: string | null = null
  /** The committed selection try-on restores (component scope). */
  let committed: { id: string | null; entry: ControllerSkinEntry | null } = { id: null, entry: null }
  let trying: string | null = null
  let previewing = false
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) listener()
  }

  async function fetchText(url: string): Promise<string> {
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
    return res.text()
  }

  function installStyle(activation: number, label: string, css: string): void {
    const el = doc.createElement('style')
    el.setAttribute('data-dsh-skin-style', label)
    el.textContent = css
    doc.head.appendChild(el)
    ledger.record(activation, `style:${label}`, () => el.remove())
  }

  function installBackground(
    activation: number,
    entry: ControllerSkinEntry,
  ): void {
    const media = entry.manifest.contributes.backgroundMedia
    if (!media) return
    const variant = themeGet() === 'dark' ? (media.dark ?? media.light) : (media.light ?? media.dark)
    if (!variant) return
    const assetBase = `${apiBase}/skins/${entry.manifest.id}`
    const nodes = buildBackgroundMedia(doc, variant, assetBase)
    if (nodes.length === 0) return
    const teardown = setLayerContent(layers.background, nodes)
    ledger.record(activation, 'layer:background', () => {
      teardown()
      clearLayer(layers.background)
    })
  }

  async function installHooks(activation: number, entry: ControllerSkinEntry): Promise<void> {
    const facet = entry.manifest.facets?.client
    if (!facet) return
    const importHooks = deps.importHooks ?? ((url: string) => import(/* @vite-ignore */ url))
    try {
      const mod = (await importHooks(`${apiBase}/skins/${entry.manifest.id}/hooks.mjs`)) as HooksModule
      const factory = mod?.default
      if (typeof factory !== 'function') throw new Error('hooks.mjs must default-export defineSkinHooks()')
      const hooks = factory()
      if (typeof hooks?.apply !== 'function') throw new Error('defineSkinHooks() must return { apply }')
      const cleanups: Array<() => void> = []
      const ctx = {
        skinId: entry.manifest.id,
        scopeAttr: entry.manifest.id,
        assetBase: `${apiBase}/skins/${entry.manifest.id}`,
        layers,
        theme: {
          get: themeGet,
          subscribe: deps.themeSubscribe ?? (() => () => {}),
        },
        onCleanup: (fn: () => void) => {
          cleanups.push(fn)
        },
      }
      hooks.apply(ctx)
      ledger.record(activation, 'hooks', () => {
        try {
          hooks.dispose?.()
        } catch (error) {
          onError(`hooks dispose failed for ${entry.manifest.id}`, error)
        }
        for (const cleanup of cleanups.reverse()) {
          try {
            cleanup()
          } catch (error) {
            onError(`hooks cleanup failed for ${entry.manifest.id}`, error)
          }
        }
      })
    } catch (error) {
      // The escape hatch never takes the static skin down with it.
      onError(`hooks failed for ${entry.manifest.id}; static skin stays active`, error)
    }
  }

  async function persist(id: string | null): Promise<void> {
    if (deps.persist) {
      await deps.persist(id)
      return
    }
    await fetchImpl(`${apiBase}/active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: id }),
    })
  }

  async function switchInternal(
    id: string | null,
    entry: ControllerSkinEntry | null,
    shouldPersist: boolean,
  ): Promise<string | null> {
    const seq = ++latestRequest
    const activation = ledger.beginActivation()
    try {
      if (id !== null && entry !== null) {
        const stylesheet = await fetchText(`${apiBase}/skins/${id}/stylesheet`)
        const patches = entry.manifest.contributes.patches !== undefined
          ? await fetchText(`${apiBase}/skins/${id}/patches`).catch(() => null)
          : null
        if (seq !== latestRequest) throw new StaleSwitch()
        installStyle(activation, 'stylesheet', stylesheet)
        if (patches !== null) installStyle(activation, 'patches', patches)
        installBackground(activation, entry)
        await installHooks(activation, entry)
      }
      if (seq !== latestRequest) throw new StaleSwitch()

      // The atomic cut: attribute first, then retire the old activation.
      if (id === null) doc.documentElement.removeAttribute('data-dsh-skin')
      else doc.documentElement.setAttribute('data-dsh-skin', id)
      const previous = currentActivation
      currentActivation = activation
      active = id
      if (shouldPersist) {
        committed = { id, entry }
        trying = null
        previewing = false
      } else {
        previewing = id !== committed.id
        trying = previewing ? id : null
      }
      emit()
      if (previous !== null) ledger.disposeActivation(previous)
      if (shouldPersist) {
        await persist(id).catch((error) => onError('failed to persist the skin selection', error))
      }
      return active
    } catch (error) {
      ledger.disposeActivation(activation)
      if (error instanceof StaleSwitch) return active
      onError(`switch to ${id ?? 'stock'} failed; previous skin intact`, error)
      return active
    }
  }

  return {
    get active() {
      return active
    },
    get layers() {
      return layers
    },

    async switchTo(id, entry) {
      return await switchInternal(id, entry, true)
    },

    async tryOn(id, entry) {
      return await switchInternal(id, entry, false)
    },

    async exitTryOn() {
      const result = await switchInternal(committed.id, committed.entry, false)
      return result
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getState() {
      return { active, trying, previewing }
    },

    shutdown() {
      latestRequest += 1
      if (currentActivation !== null) {
        ledger.disposeActivation(currentActivation)
        currentActivation = null
      }
      active = null
      trying = null
      previewing = false
      committed = { id: null, entry: null }
      emit()
      doc.documentElement.removeAttribute('data-dsh-skin')
    },
  }
}

class StaleSwitch extends Error {
  constructor() {
    super('superseded by a newer switch')
  }
}
