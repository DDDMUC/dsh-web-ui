// @vitest-environment jsdom

/**
 * Built-in v2 skin acceptance tests (issue #506, M3).
 *
 * Two gates for every skin directory under skins/:
 *
 *  1. Catalog + CSS: the directory loads through loadSkinCatalog with zero
 *     diagnostics, its skin.json passes validateSkinManifestV2, and both
 *     skin.css / patches.css pass transformSkinCss (force-scoping +
 *     whitelist) without throwing.
 *  2. Hooks lifecycle: hooks.mjs (when present) imports with no top-level
 *     side effects, apply(ctx) does not throw against a jsdom
 *     SkinHooksContext double (six real decoration-layer divs, light
 *     theme, no-op subscribe), and after dispose + every registered
 *     cleanup the document contains no node the activation added, the
 *     body attributes are restored and the document title is back.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import { transformSkinCss } from '../src/core/css-safety/transform.ts'
import { validateSkinManifestV2 } from '../src/core/manifest-v2/validate.ts'
import { loadSkinCatalog } from '../src/skin-repo.ts'

const SKINS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skins')
/** A path that never exists, so the catalog sees no user skins. */
const NO_USER_SKINS = join(tmpdir(), 'dsh-builtin-skins-spec-no-user-dir')

const LAYER_NAMES = ['background', 'ambient', 'top', 'bottom', 'sidebar', 'foreground']

const skinIds = readdirSync(SKINS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(SKINS_DIR, d.name, 'skin.json')))
  .map((d) => d.name)
  .sort()

const hookSkinIds = skinIds.filter((id) => existsSync(join(SKINS_DIR, id, 'hooks.mjs')))

describe('built-in v2 skins: catalog and stylesheets', () => {
  it('loads the catalog with no diagnostics and every skin present', () => {
    const catalog = loadSkinCatalog({ builtinDir: SKINS_DIR, userDir: NO_USER_SKINS })
    expect(catalog.diagnostics).toEqual([])
    expect(catalog.skins.map((s) => s.manifest.id).sort()).toEqual(skinIds)
  })

  for (const id of skinIds) {
    it(id + ': manifest validates and stylesheets transform', () => {
      const dir = join(SKINS_DIR, id)
      const raw = JSON.parse(readFileSync(join(dir, 'skin.json'), 'utf8'))
      const result = validateSkinManifestV2(raw)
      expect(result.ok, result.errors.join('; ')).toBe(true)
      const manifest = result.manifest
      expect(manifest).toBeDefined()
      if (!manifest) return
      const css = readFileSync(join(dir, manifest.contributes.stylesheet), 'utf8')
      expect(() => transformSkinCss(css, { skinId: id, filename: 'skin.css' })).not.toThrow()
      if (manifest.contributes.patches !== undefined) {
        const patches = readFileSync(join(dir, manifest.contributes.patches), 'utf8')
        expect(() => transformSkinCss(patches, { skinId: id, filename: 'patches.css' })).not.toThrow()
      }
    })
  }
})

describe('built-in v2 skins: hooks lifecycle', () => {
  beforeAll(() => {
    // Hermetic: hooks must never reach the network from a unit test. Every
    // data path in the built-in hooks fails safe on a rejected fetch.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline in tests')))
  })

  /** Snapshot of every body attribute (name -> value) for restore checks. */
  const bodyAttributes = () => {
    const out = new Map()
    for (const attr of document.body.attributes) out.set(attr.name, attr.value)
    return out
  }

  for (const id of hookSkinIds) {
    it(id + ': import is side-effect free and apply/cleanup leaves nothing behind', async () => {
      // Six real decoration-layer divs, as the controller mounts them.
      const layers = {}
      for (const name of LAYER_NAMES) {
        const el = document.createElement('div')
        el.setAttribute('data-dsh-skin-layer', name)
        el.setAttribute('aria-hidden', 'true')
        document.body.append(el)
        layers[name] = el
      }

      // Prime the <title> element: jsdom creates it lazily on the first
      // document.title write, and the skins that pin a title would
      // otherwise leave a "new" node behind.
      document.title = 'builtin-skins-spec'
      const beforeNodes = new Set(document.querySelectorAll('*'))
      const beforeTitle = document.title
      const beforeBodyAttrs = bodyAttributes()

      const mod = await import(pathToFileURL(join(SKINS_DIR, id, 'hooks.mjs')).href)
      expect(typeof mod.default).toBe('function')
      // Importing must not have touched the DOM (contract: no top-level
      // side effects).
      expect([...document.querySelectorAll('*')].every((el) => beforeNodes.has(el))).toBe(true)

      const hooks = mod.default()
      const cleanups = []
      const ctx = {
        skinId: id,
        scopeAttr: id,
        assetBase: '/api/skin-center/v2/skins/' + id,
        layers,
        theme: {
          get: () => 'light',
          subscribe: () => () => {},
        },
        onCleanup: (fn) => {
          cleanups.push(fn)
        },
      }

      expect(() => hooks.apply(ctx)).not.toThrow()

      // Dispose path: optional dispose() first, then the cleanups in
      // reverse registration order (the controller's order). Cleanup must
      // be idempotent — run the whole set a second time.
      expect(() => hooks.dispose?.()).not.toThrow()
      for (const cleanup of [...cleanups].reverse()) cleanup()
      for (const cleanup of cleanups) cleanup()

      // No node the activation added may survive teardown.
      const survivors = [...document.querySelectorAll('*')].filter((el) => !beforeNodes.has(el))
      expect(survivors.map((el) => el.outerHTML.slice(0, 120))).toEqual([])
      expect(document.title).toBe(beforeTitle)
      expect(bodyAttributes()).toEqual(beforeBodyAttrs)

      for (const name of LAYER_NAMES) layers[name].remove()
    })
  }
})
